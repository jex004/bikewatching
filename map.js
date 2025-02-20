// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiamV4MDA0IiwiYSI6ImNtN2R4NWk5YTA4N24ybnB2bGRqeTEzOTEifQ.Ru7wH2foUPyEsmiIGjrOzg';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.08268241189755, 42.36579381740771], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});