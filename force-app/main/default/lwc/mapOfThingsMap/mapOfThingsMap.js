import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
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
                this.renderShapefile(); // Ensure the map updates when markers change
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

        // Render shapefile (filtered to only show shapes containing markers)
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
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
            const geojson = await shp(arrayBuffer); // Convert shapefile to GeoJSON

            // Filter shapes to only include those containing at least one marker
            const filteredFeatures = geojson.features.filter(feature => 
                this.doesShapeContainMarker(feature)
            );

            if (filteredFeatures.length === 0) {
                console.warn('No shapes contain markers.');
            }

            // Create a new GeoJSON object with only the filtered features
            const filteredGeoJson = { type: "FeatureCollection", features: filteredFeatures };

            // Remove previous layers before adding new ones
            if (this.geoJsonLayer) {
                this.map.removeLayer(this.geoJsonLayer);
            }

            // Add filtered GeoJSON to the map
            this.geoJsonLayer = L.geoJSON(filteredGeoJson, {
                style: function(feature) {
                    return {
                        color: '#CC5500',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.5
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                    }
                }
            }).addTo(this.map);

            // Fit map bounds to filtered GeoJSON
            if (this.autoFitBounds && this.geoJsonLayer.getBounds().isValid()) {
                this.map.fitBounds(this.geoJsonLayer.getBounds());
            }
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
        }
    }

    /**
     * Determines if a shape contains at least one marker
     * @param {Object} feature - GeoJSON feature
     * @returns {boolean} - True if at least one marker is inside the shape
     */
    doesShapeContainMarker(feature) {
        if (!this.markersExist || !feature.geometry) {
            return false;
        }

        let shape;
        if (feature.geometry.type === "Polygon") {
            shape = L.polygon(this.convertCoords(feature.geometry.coordinates));
        } else if (feature.geometry.type === "MultiPolygon") {
            shape = L.polygon(this.convertCoords(feature.geometry.coordinates.flat()));
        } else {
            return false;
        }

        // Check if at least one marker is inside the shape
        return this.markers.some(marker => 
            shape.getBounds().contains([marker.lat, marker.lng])
        );
    }

    /**
     * Converts GeoJSON coordinates (lng, lat) to Leaflet coordinates (lat, lng)
     * @param {Array} coordinates - GeoJSON coordinate array
     * @returns {Array} - Leaflet-compatible coordinates
     */
    convertCoords(coordinates) {
        return coordinates.map(polygon =>
            polygon.map(coordPair => [coordPair[1], coordPair[0]]) // Swap [lng, lat] to [lat, lng]
        );
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
