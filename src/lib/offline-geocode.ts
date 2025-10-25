/* Lightweight offline reverse geocode utilities.
   - Loads small GeoJSON files from /geo
   - Provides point-in-polygon and nearest-city fallbacks
   - Designed for demo/dev use; optimize or precompute for large datasets
*/
export type City = {
  name: string;
  country?: string;
  lat: number;
  lon: number;
  population?: number;
};

let citiesCache: City[] | null = null;
let countriesGeoJson: any | null = null;
let admin1GeoJson: any | null = null;

export async function loadCities(): Promise<City[]> {
  if (citiesCache) return citiesCache;
  try {
    const res = await fetch('/geo/cities.json');
    citiesCache = await res.json();
  } catch (e) {
    citiesCache = [];
  }
  return citiesCache || [];
}

export async function loadCountries(): Promise<any> {
  if (countriesGeoJson) return countriesGeoJson;
  try {
    const res = await fetch('/geo/countries.json');
    countriesGeoJson = await res.json();
  } catch (e) {
    countriesGeoJson = { type: 'FeatureCollection', features: [] };
  }
  return countriesGeoJson;
}

export async function loadAdmin1(): Promise<any> {
  if (admin1GeoJson) return admin1GeoJson;
  try {
    const res = await fetch('/geo/admin1.json');
    admin1GeoJson = await res.json();
  } catch (e) {
    admin1GeoJson = { type: 'FeatureCollection', features: [] };
  }
  return admin1GeoJson;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simple ray-casting point-in-polygon. Assumes polygon coordinates in [lon,lat] pairs.
export function pointInPolygon(point: [number, number], polygon: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Reverse geocode: try admin1 polygon, then country polygon, then nearest city.
 * Returns { country?, admin1?, city?, distanceKm? }
 */
export async function reverseGeocode(lat: number, lon: number, maxCityKm = 50) {
  const admin = await loadAdmin1();
  const countries = await loadCountries();

  function searchPolygons(featureCollection: any) {
    if (!featureCollection?.features) return null;
    for (const f of featureCollection.features) {
      const geom = f.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') {
        if (pointInPolygon([lon, lat], geom.coordinates[0])) return f.properties || null;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (pointInPolygon([lon, lat], poly[0])) return f.properties || null;
        }
      }
    }
    return null;
  }

  const adminProps = searchPolygons(admin);
  const countryProps = searchPolygons(countries);

  const cities = await loadCities();
  let nearest: City | null = null;
  let bestDist = Infinity;
  for (const c of cities) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      nearest = c;
    }
  }

  return {
    country: countryProps?.NAME || countryProps?.name || nearest?.country,
    admin1: adminProps?.name || null,
    city: bestDist <= maxCityKm ? nearest?.name : null,
    distanceKm: bestDist === Infinity ? undefined : bestDist,
  };
}
