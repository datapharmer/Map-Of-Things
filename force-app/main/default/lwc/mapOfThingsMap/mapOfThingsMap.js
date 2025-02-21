import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;

    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.map) {
                //this.renderMarkers(); // Render markers whenever the markers array is updated.
            }
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
    }

    get bounds() {
        if (this.markersExist) {
            return this.markers.map(marker => {
                return [marker.lat, marker.lng];
            });
        }
        return [];
    }

    renderedCallback() {
        this.template.querySelector(MAP_CONTAINER).style.height = this.mapSizeY;
    }

    async connectedCallback() {
        try {
            // Load external JS and CSS libraries
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
                loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL),
                loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
            ]);
            this.drawMap();
        } catch (error) {
            console.error('Error loading external libraries:', error);
        }
    }

    async drawMap() {
        const container = this.template.querySelector(MAP_CONTAINER);
        this.map = L.map(container, {
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Add tile layer
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Render markers if they exist
        if (this.markersExist) {
            this.renderMarkers();
        }

        // Render shapefile
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

renderMarkers() {
    // Clear existing markers
    if (this.markerLayer) {
        this.map.removeLayer(this.markerLayer);
    }

    // Define custom icon for the markers
    const customIcon = L.icon({
        //iconUrl: 'https://www.trustindiana.in.gov/wp-content/uploads/2018/06/School-Icon-300x300@2x.png', // Custom icon URL
        iconSize: [50, 50], // Adjust the size of the icon as needed
        iconAnchor: [25, 50] // Anchor point to properly position the icon on the map
    });

    // Create a layer group for the markers
    this.markerLayer = L.layerGroup(
        this.markers.map(marker => {
            return L.marker([marker.lat, marker.lng], {
                icon: customIcon, // Use the custom icon
                title: marker.title || '',
                rotationAngle: marker.rotationAngle || 0 // Optional: if using the marker rotation addon
            }).bindPopup(marker.popupContent || '');
        })
    );

    // Add the marker layer to the map
    this.markerLayer.addTo(this.map);

    // Auto fit bounds if enabled
    if (this.autoFitBounds && this.markersExist) {
        this.map.flyToBounds(this.bounds, { padding: FIT_BOUNDS_PADDING });
    }

    // Apply Shapefile filtering after markers are rendered
    this.filterShapefileByMarkers();
}

async renderShapefile() {
    try {
        const shapefileUrl = SCHOOLDISTRICTS_ZIP;

        // Fetch and parse the Shapefile from the .zip file
        const response = await fetch(shapefileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const geojson = await shp(arrayBuffer); // Use `shp.js` to parse the zip file into GeoJSON

        // Function to generate a random color
        function getRandomColor() {
            const letters = '0123456789ABCDEF';
            let color = '#';
            for (let i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        }

        // Add GeoJSON to the map with styles
        this.geoJsonLayer = L.geoJSON(geojson, {
            style: function(feature) {
                return {
                    color: '#CC5500',
                    //color: getRandomColor(), // Assign a random color to each feature
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.5 // Adjust fill opacity for visibility
                };
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    // Add label to the map
                    const labelText = feature.properties.NAME; 
                    const centroid = layer.getBounds().getCenter(); 
                    const label = L.marker(centroid, {
                        icon: L.divIcon({
                            className: 'shapefile-label', 
                            html: labelText,
                            iconSize: [100, 20] 
                        })
                       }).addTo(this.map);

                    layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                }
            }
        }).addTo(this.map);

        // Fit map bounds to GeoJSON
        if (this.autoFitBounds) {
            const bounds = this.geoJsonLayer.getBounds();
            if (bounds.isValid()) {
                this.map.fitBounds(bounds);
            }
        }
    } catch (error) {
        console.error('Error loading or parsing shapefile:', error);
    }
}

filterShapefileByMarkers() {
    if (!this.geoJsonLayer || !this.markerLayer) {
        return;
    }

    this.geoJsonLayer.eachLayer(shapefileLayer => {
        // Check if any marker is within the shapefile polygon
        let hasMarkerInside = false;
        this.markerLayer.eachLayer(marker => {
            if (this.isMarkerInsidePolygon(marker.getLatLng(), shapefileLayer.getLatLngs())) {
                hasMarkerInside = true;
            }
        });

        // If no marker is inside the shapefile polygon, remove the layer
        if (!hasMarkerInside) {
            this.map.removeLayer(shapefileLayer);
        }
    });
}

isMarkerInsidePolygon(markerLatLng, polygonLatLngs) {
    let inside = false;
    for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
        const lat1 = polygonLatLngs[i].lat;
        const lng1 = polygonLatLngs[i].lng;
        const lat2 = polygonLatLngs[j].lat;
        const lng2 = polygonLatLngs[j].lng;

        const intersect = ((lng1 > markerLatLng.lng) !== (lng2 > markerLatLng.lng)) &&
            (markerLatLng.lat < (lat2 - lat1) * (markerLatLng.lng - lng1) / (lng2 - lng1) + lat1);
        if (intersect) inside = !inside;
    }

    return inside;
}

    generatePopupContent(properties) {
        let content = '';
        for (const key in properties) {
            if (properties.hasOwnProperty(key)) {
                content += `${key}: ${properties[key]}<br>`;
            }
        }
        return content;
    }

    checkPolygonForMarkers(layer, markers) {
    const polygonBounds = layer.getBounds();
    return markers.some(marker => {
        const markerLatLng = L.latLng(marker.lat, marker.lng);
        return polygonBounds.contains(markerLatLng) && layer.contains(markerLatLng);
    });
}
    
}
