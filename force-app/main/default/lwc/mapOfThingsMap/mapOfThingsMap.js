import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const SHP_JS_URL = '/shp.js';

const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    geoJsonLayer; // Variable to store the GeoJSON layer
    _markers = []; // Internal marker storage

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
                this.renderShapefile(); // Update shapes when markers change
            }
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
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
                loadScript(this, LEAFLET_JS + SHP_JS_URL)
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

        // Render shapefile (filtered by markers)
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

    async renderShapefile() {
        try {
            const shapefileUrl = SCHOOLDISTRICTS_ZIP;

            // Fetch and parse the shapefile
            const response = await fetch(shapefileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer); // Parse the shapefile into GeoJSON

            // Filter GeoJSON features to include only those containing markers
            const filteredGeojson = this.filterGeojsonFeaturesByMarkers(geojson);

            // Clear any previous GeoJSON layers
            if (this.geoJsonLayer) {
                this.map.removeLayer(this.geoJsonLayer);
            }

            // Add filtered GeoJSON to the map
            this.geoJsonLayer = L.geoJSON(filteredGeojson, {
                style: () => ({
                    color: '#CC5500',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.5
                }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                    }
                }
            }).addTo(this.map);

            // Adjust map bounds to fit the filtered shapes
            if (this.autoFitBounds && this.geoJsonLayer.getBounds().isValid()) {
                this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: FIT_BOUNDS_PADDING });
            }
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
        }
    }

    filterGeojsonFeaturesByMarkers(geojson) {
        if (!this.markersExist) {
            return { type: 'FeatureCollection', features: [] };
        }

        const markersLatLng = this.markers.map(marker => L.latLng(marker.lat, marker.lng));

        const filteredFeatures = geojson.features.filter(feature => {
            const shapeBounds = L.geoJSON(feature).getBounds();

            // Check if any marker is within the bounds of the current shape
            return markersLatLng.some(markerLatLng => shapeBounds.contains(markerLatLng));
        });

        return {
            type: 'FeatureCollection',
            features: filteredFeatures
        };
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
