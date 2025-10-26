import * as ort from 'onnxruntime-web'

const MODEL_URL = '/models/yolov5n-0.5.onnx'

/** The x and y coordinates of a point. */
export interface Point {
  x: number
  y: number
}

/** A rectangle given by its top left coordinates and dimensions. */
export interface Box {
  /** The x coordinate of the the top left (xMin). */
  x: number
  /** The y coordinate of the top left (yMin). */
  y: number
  /** The width of the box. */
  width: number
  /** The height of the box. */
  height: number
}

/** A face detection with landmarks and confidence score. */
export interface FaceDetection {
  /** The region within the image that contains the face. */
  box: Box
  /** Face landmarks (e.g. eyes, nose, mouth corners). */
  landmarks: Point[]
  /** Detection confidence score (0 to 1). */
  score: number
}

let session: ort.InferenceSession | null = null

export async function loadModel() {
  if (!session) {
    session = await ort.InferenceSession.create(MODEL_URL)
  }
}

/**
 * Preprocess an image for YOLO model input.
 * 
 * Converts the image to a 640x640 tensor with normalized RGB values.
 */
function preprocessImage(img: HTMLImageElement): ort.Tensor {
  const size = 640
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, size, size)
  const imageData = ctx.getImageData(0, 0, size, size)

  // Convert to planar RGB format (NCHW) and normalize to [0, 1]
  const data = new Float32Array(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    data[i] = imageData.data[i * 4] / 255.0 // R channel
    data[i + size * size] = imageData.data[i * 4 + 1] / 255.0 // G channel
    data[i + size * size * 2] = imageData.data[i * 4 + 2] / 255.0 // B channel
  }

  return new ort.Tensor('float32', data, [1, 3, size, size])
}

/**
 * Detect faces in the given image using YOLOv5Face model.
 * 
 * @param img The image to detect faces in
 * @returns Array of face detections with boxes, landmarks, and scores
 */
export async function detectFaces(img: HTMLImageElement): Promise<FaceDetection[]> {
  if (!session) {
    await loadModel()
  }
  if (!session) {
    return []
  }

  const tensor = preprocessImage(img)

  const feeds: Record<string, ort.Tensor> = {}
  feeds[session.inputNames[0]] = tensor

  const output = await session.run(feeds)

  const outputName = session.outputNames[0]
  const outputTensor = output[outputName]
  
  if (!outputTensor) {
    return []
  }

  const data = outputTensor.data as Float32Array
  const faces = extractDetectionsFromYOLOOutput(data)
  
  return faces
}

/**
 * Extract face detections from YOLOv5Face's output.
 * 
 * Output shape is [1, 25200, 16] where each row has:
 * [x_center, y_center, width, height, confidence, 
 *  left_eye_x, left_eye_y, right_eye_x, right_eye_y, 
 *  nose_x, nose_y, left_mouth_x, left_mouth_y, 
 *  right_mouth_x, right_mouth_y, unused]
 * 
 * @param data Raw YOLO output data
 * @returns Filtered and deduplicated face detections
 */
function extractDetectionsFromYOLOOutput(data: Float32Array): FaceDetection[] {
  const confidenceThreshold = 0.7
  const iouThreshold = 0.45
  const numDetections = 25200
  const featuresPerDetection = 16
  
  const rawDetections: FaceDetection[] = []
  
  // Iterate over each detection row
  for (let i = 0; i < numDetections; i++) {
    const offset = i * featuresPerDetection
    
    const score = data[offset + 4]
    if (score < confidenceThreshold) continue
    
    // Parse bounding box (convert from center format to corner format)
    const xCenter = data[offset]
    const yCenter = data[offset + 1]
    const width = data[offset + 2]
    const height = data[offset + 3]
    const x = xCenter - width / 2
    const y = yCenter - height / 2
    
    // Parse landmarks (5 facial keypoints)
    const landmarks: Point[] = [
      { x: data[offset + 5], y: data[offset + 6] },   // left eye
      { x: data[offset + 7], y: data[offset + 8] },   // right eye
      { x: data[offset + 9], y: data[offset + 10] },  // nose
      { x: data[offset + 11], y: data[offset + 12] }, // left mouth corner
      { x: data[offset + 13], y: data[offset + 14] }, // right mouth corner
    ]
    
    rawDetections.push({ box: { x, y, width, height }, landmarks, score })
  }
  
  // Apply Non-Maximum Suppression to remove duplicate detections
  return applyNMS(rawDetections, iouThreshold)
}

/**
 * Apply Non-Maximum Suppression to remove overlapping detections.
 * 
 * @param detections Array of face detections
 * @param iouThreshold IoU threshold for suppression (typically 0.45)
 * @returns Filtered detections with duplicates removed
 */
function applyNMS(
  detections: FaceDetection[],
  iouThreshold: number
): FaceDetection[] {
  // Sort by score (confidence) in descending order
  detections.sort((a, b) => b.score - a.score)
  
  const selected: FaceDetection[] = []
  const suppressed = new Set<number>()
  
  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue
    
    selected.push(detections[i])
    
    // Suppress overlapping detections
    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) continue
      
      const iou = calculateIoU(detections[i].box, detections[j].box)
      if (iou > iouThreshold) {
        suppressed.add(j)
      }
    }
  }
  
  return selected
}

/**
 * Calculate Intersection over Union (IoU) between two boxes.
 * 
 * @param box1 First bounding box
 * @param box2 Second bounding box
 * @returns IoU value between 0 and 1
 */
function calculateIoU(box1: Box, box2: Box): number {
  // Get corner coordinates
  const x1_min = box1.x
  const y1_min = box1.y
  const x1_max = box1.x + box1.width
  const y1_max = box1.y + box1.height
  
  const x2_min = box2.x
  const y2_min = box2.y
  const x2_max = box2.x + box2.width
  const y2_max = box2.y + box2.height
  
  // Calculate intersection rectangle
  const intersectXMin = Math.max(x1_min, x2_min)
  const intersectYMin = Math.max(y1_min, y2_min)
  const intersectXMax = Math.min(x1_max, x2_max)
  const intersectYMax = Math.min(y1_max, y2_max)
  
  const intersectionWidth = Math.max(0, intersectXMax - intersectXMin)
  const intersectionHeight = Math.max(0, intersectYMax - intersectYMin)
  const intersectionArea = intersectionWidth * intersectionHeight
  
  // Calculate union
  const box1Area = box1.width * box1.height
  const box2Area = box2.width * box2.height
  const unionArea = box1Area + box2Area - intersectionArea
  
  return unionArea > 0 ? intersectionArea / unionArea : 0
}