// Set your Mapbox access token here
mapboxgl.accessToken = "pk.eyJ1IjoiamV4MDA0IiwiYSI6ImNtN2R4NWk5YTA4N24ybnB2bGRqeTEzOTEifQ.Ru7wH2foUPyEsmiIGjrOzg";

// Helper function: Compute station traffic (arrivals, departures, total)
function computeStationTraffic(stations, trips) {
  // Compute departures using d3.rollup
  const departures = d3.rollup(
    trips, 
    (v) => v.length, 
    (d) => d.start_station_id
  );
  
  // Compute arrivals using d3.rollup
  const arrivals = d3.rollup(
    trips, 
    (v) => v.length, 
    (d) => d.end_station_id
  );
  
  // Update each station with arrivals, departures, and total traffic
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Helper function: Convert a Date to minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Helper function: Filter trips based on a time filter (in minutes)
function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1 
    ? trips // No filtering if timeFilter is -1
    : trips.filter((trip) => {
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.08268241189755, 42.36579381740771], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

// Helper function to convert coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

map.on('load', async () => { 
  // Add bike lane data from Boston Open Data
  map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });
  map.addLayer({
      id: 'boston_bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4
      }
  });

  // Add bike lane data from Cambridge Open Data
  map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
      id: 'cambridge_bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4
      }
  });

  // Select the SVG element inside the map container
  const svg = d3.select("#map").select("svg");

  // Fetch and parse the Bluebikes stations JSON and trips CSV
  let jsonData, trips;
  try {
      const stationsUrl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
      const tripsUrl = "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

      // Fetch JSON data
      jsonData = await d3.json(stationsUrl);

      // Fetch CSV data and parse date strings immediately into Date objects
      trips = await d3.csv(
        tripsUrl,
        (trip) => {
          trip.started_at = new Date(trip.started_at);
          trip.ended_at = new Date(trip.ended_at);
          return trip;
        }
      );

      console.log('Loaded JSON Data:', jsonData);
      console.log('Loaded CSV Data:', trips);

      // Extract stations array and compute initial traffic using all trips
      let stations = jsonData.data.stations;
      stations = computeStationTraffic(stations, trips);
      console.log("Updated Stations with Traffic Data:", stations);

      // Define the radius scale using square root scaling
      const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)]) // Domain: traffic range
        .range([0, 25]); // Default range when no filtering is applied

      // Define the stationFlow quantize scale to map ratio to discrete values
      let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

      // Append circles to the SVG for each station using a key function
      const circles = svg.selectAll('circle')
        .data(stations, (d) => d.short_name)  // Use station short_name as the key
        .enter()
        .append('circle')
        .attr('fill', 'steelblue')  
        .attr('stroke', 'white')    
        .attr('stroke-width', 1)    
        .attr('opacity', 0.6)       
        .attr('pointer-events', 'auto')
        .attr('r', d => radiusScale(d.totalTraffic))
        // Set custom CSS variable for departure ratio using the quantize scale
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
        .each(function(d) {  
          d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

      // Function to update circle positions when the map moves/zooms
      function updatePositions() {
        circles
          .attr('cx', d => getCoords(d).cx)  
          .attr('cy', d => getCoords(d).cy);
      }

      // Initial position update when map loads
      updatePositions();

      // Reposition markers on map interactions
      map.on('move', updatePositions);
      map.on('zoom', updatePositions);
      map.on('resize', updatePositions);
      map.on('moveend', updatePositions);

      // Define updateScatterPlot() to filter trips by time and update the scatterplot circles
      function updateScatterPlot(timeFilter) {
        // Filter trips based on the selected time
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        
        // Recompute station traffic using the filtered trips
        const filteredStations = computeStationTraffic(stations, filteredTrips);
        
        // Dynamically adjust the radius scale based on filtering:
        // Use the default range [0, 25] when no filter is applied, else [3, 50]
        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
        
        // Update the circles with the new data, using the key function for consistency
        circles
          .data(filteredStations, (d) => d.short_name)
          .join('circle')
          .attr('fill', 'steelblue')
          .attr('stroke', 'white')
          .attr('stroke-width', 1)
          .attr('opacity', 0.6)
          .attr('pointer-events', 'auto')
          .attr('r', (d) => radiusScale(d.totalTraffic))
          // Update the custom CSS variable for departure ratio
          .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic))
          .each(function(d) {
            // Update tooltip text
            d3.select(this).select('title').remove();
            d3.select(this)
              .append('title')
              .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
          });
      }

      // Select the slider and time display elements
      const timeSlider = document.getElementById('timeSlider');
      const selectedTime = document.getElementById('selectedTime');
      const anyTimeLabel = document.getElementById('anyTimeLabel');

      // Helper function to format time as HH:MM AM/PM
      function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);
        return date.toLocaleString('en-US', { timeStyle: 'short' });
      }

      // Update displayed time and scatterplot based on slider input
      function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value);
  
        if (timeFilter === -1) {
          selectedTime.textContent = '';
          anyTimeLabel.style.display = 'block';
        } else {
          selectedTime.textContent = formatTime(timeFilter);
          anyTimeLabel.style.display = 'none';
        }
        
        // Update scatterplot based on the current time filter
        updateScatterPlot(timeFilter);
      }
  
      // Listen for slider input and update display in real-time
      timeSlider.addEventListener('input', updateTimeDisplay);
  
      // Initialize display on page load
      updateTimeDisplay();

  } catch (error) {
      console.error('Error loading data:', error);
  }
});
