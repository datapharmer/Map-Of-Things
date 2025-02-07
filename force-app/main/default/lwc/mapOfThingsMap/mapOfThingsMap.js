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

const FIT_BOUNDS_PADDING = [20, 20];
const MIN_ZOOM = 2;

export default class MapOfThingsMap extends LightningElement {
    map;

    geoJsonLayer; // To hold the GeoJSON layer
    markerLayer; // To hold the marker layer
    
    _markers = [];
    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;
    @api
        get markers(){
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.map) {
                this.renderMarkers();
            }
        }
    }  

    renderedCallback() {
        this.template.querySelector('div.inner-map-container').style.height = this.mapSizeY;
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
        const container = this.template.querySelector('div.inner-map-container');
        this.map = L.map(container, {
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Render the shapefile and markers
        await this.renderShapefile();
        this.renderMarkers();
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

            // Add GeoJSON to the map
            L.geoJSON(geojson, {
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                    }
                }
            }).addTo(this.map);

            // Fit map bounds to GeoJSON
            if (this.autoFitBounds) {
                const geoJsonLayer = L.geoJSON(geojson);
                const bounds = geoJsonLayer.getBounds();
                if (bounds.isValid()) {
                    this.map.fitBounds(bounds);
                }
            }
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
        }
    }

        renderMarkers() {
        if (this.markerLayer) {
            // Remove the existing marker layer
            this.map.removeLayer(this.markerLayer);
        }

        // Create a new marker layer
        this.markerLayer = L.layerGroup();

        this._markers.forEach(marker => {
            const { lat, lng, popup, icon } = marker;

            // Create a Leaflet marker
            const leafletMarker = L.marker([lat, lng], {
                icon: icon
                    ? L.icon({
                          iconUrl: icon,
                          iconSize: [25, 41],
                          iconAnchor: [12, 41]
                      })
                    : undefined
            });

            // Bind the popup if it exists
            if (popup) {
                leafletMarker.bindPopup(popup);
            }

            // Add the marker to the marker layer
            leafletMarker.addTo(this.markerLayer);
        });

        // Add the marker layer to the map
        this.markerLayer.addTo(this.map);

        // Fit map bounds to include both markers and shapefile
        if (this.autoFitBounds) {
            const allBounds = [];
            if (this.geoJsonLayer) {
                allBounds.push(this.geoJsonLayer.getBounds());
            }
            if (this.markerLayer.getLayers().length > 0) {
                allBounds.push(this.markerLayer.getBounds());
            }

            // Combine bounds and fit map
            const combinedBounds = allBounds.reduce((acc, bounds) => acc.extend(bounds), L.latLngBounds());
            if (combinedBounds.isValid()) {
                this.map.fitBounds(combinedBounds, { padding: FIT_BOUNDS_PADDING });
            }
        }
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
}
