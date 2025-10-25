import * as ort from 'onnxruntime-web'

const MODEL_URL = '/models/model.onnx' // relative to public folder

let session: ort.InferenceSession | null = null

export async function loadModel() {
  if (!session) {
    session = await ort.InferenceSession.create(MODEL_URL)
  }
}

function preprocess(img: HTMLImageElement): ort.Tensor {
  // Create canvas and draw image resized to model input size (e.g. 640x640)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const size = 640
  canvas.width = size
  canvas.height = size
  ctx.drawImage(img, 0, 0, size, size)
  const imageData = ctx.getImageData(0, 0, size, size)

  // Get data as Float32Array and normalize pixel values
  const data = new Float32Array(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    data[i] = imageData.data[i * 4] / 255.0 // R
    data[i + size * size] = imageData.data[i * 4 + 1] / 255.0 // G
    data[i + size * size * 2] = imageData.data[i * 4 + 2] / 255.0 // B
  }

  // Create ONNX tensor with shape [1,3,640,640]
  return new ort.Tensor('float32', data, [1, 3, size, size])
}

export async function detectFaces(img: HTMLImageElement): Promise<any[]> {
  if (!session) {
    await loadModel()
  }
  if (!session) {
    return []
  }

  const tensor = preprocess(img)

  const feeds: Record<string, ort.Tensor> = {}
  feeds[session.inputNames[0]] = tensor

  const output = await session.run(feeds)

  // Post-processing depends on model specific output format, typical YOLO outputs boxes, scores, classes
  // This is a placeholder. You will need to implement non-max suppression (NMS) and decode boxes accordingly.

  // For demonstration, returning raw output:
  return output
}