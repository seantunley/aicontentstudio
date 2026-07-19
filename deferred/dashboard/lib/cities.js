// Curated weather-location list. Each carries its own coordinates, so the widget never has to geocode
// a typed string (no spelling errors → no silent failures). The dropdown offers these; a value not in
// the list still works via a geocoding fallback in the widget.
export const CITIES = [
  // South Africa
  { name: 'Johannesburg', lat: -26.2041, lon: 28.0473 },
  { name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  { name: 'Durban', lat: -29.8587, lon: 31.0218 },
  { name: 'Pretoria', lat: -25.7479, lon: 28.2293 },
  { name: 'Gqeberha (Port Elizabeth)', lat: -33.9608, lon: 25.6022 },
  { name: 'Bloemfontein', lat: -29.0852, lon: 26.1596 },
  { name: 'East London', lat: -33.0153, lon: 27.9116 },
  { name: 'Polokwane', lat: -23.9045, lon: 29.4689 },
  { name: 'Mbombela (Nelspruit)', lat: -25.4753, lon: 30.9694 },
  { name: 'Kimberley', lat: -28.7282, lon: 24.7499 },
  { name: 'Stellenbosch', lat: -33.9321, lon: 18.8602 },
  // Africa
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { name: 'Accra', lat: 5.6037, lon: -0.1870 },
  { name: 'Gaborone', lat: -24.6282, lon: 25.9231 },
  { name: 'Windhoek', lat: -22.5609, lon: 17.0658 },
  { name: 'Harare', lat: -17.8252, lon: 31.0335 },
  { name: 'Maputo', lat: -25.9692, lon: 32.5732 },
  // World
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { name: 'Berlin', lat: 52.5200, lon: 13.4050 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'New York', lat: 40.7128, lon: -74.0060 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { name: 'São Paulo', lat: -23.5558, lon: -46.6396 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
];

export const CITY_NAMES = CITIES.map((c) => c.name);
export const findCity = (name) => CITIES.find((c) => c.name === name);
