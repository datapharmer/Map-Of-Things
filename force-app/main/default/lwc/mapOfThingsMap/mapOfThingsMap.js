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
    geoJsonLayer; // Store the current GeoJSON layer

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
                this.renderShapefile(); // Refresh the shapes when markers change
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

    // Render markers and shapefile, then filter polygons without markers
    await this.renderMarkers();
    await this.renderShapefile();
    this.filterPolygonsWithoutMarkers(); // Ensure filtering happens after everything is loaded

    // Dispatch custom event to notify that the map is initialized
    this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
}

async renderMarkers() {
    // Clear existing markers
    if (this.markerLayer) {
        this.map.removeLayer(this.markerLayer);
    }

    const customIcon = L.icon({
        iconUrl: 'https://www.trustindiana.in.gov/wp-content/uploads/2018/06/School-Icon-300x300@2x.png',
        iconSize: [50, 50],
        iconAnchor: [25, 50]
    });

    this.markerLayer = L.layerGroup(
        this.markers.map(marker => 
            L.marker([marker.lat, marker.lng], { 
                icon: customIcon,
                title: marker.title || '',
                rotationAngle: marker.rotationAngle || 0
            }).bindPopup(marker.popupContent || '')
        )
    );

    this.markerLayer.addTo(this.map);

    if (this.autoFitBounds && this.markersExist) {
        this.map.flyToBounds(this.bounds, { padding: FIT_BOUNDS_PADDING });
    }
}

async renderShapefile() {
    try {
        const shapefileUrl = SCHOOLDISTRICTS_ZIP;
        const response = await fetch(shapefileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const geojson = await shp(arrayBuffer);

        this.geoJsonLayer = L.geoJSON(geojson, {
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

// New method to filter out polygons without markers inside
filterPolygonsWithoutMarkers() {
    if (!this.geoJsonLayer || !this.markerLayer) {
        console.warn('GeoJSON or markers not loaded yet.');
        return;
    }

    this.geoJsonLayer.eachLayer(layer => {
        if (layer instanceof L.Polygon || layer instanceof L.MultiPolygon) {
            const polygonBounds = layer.getBounds();
            const hasMarkerInside = this.markers.some(marker =>
                polygonBounds.contains(L.latLng(marker.lat, marker.lng))
            );

            if (!hasMarkerInside) {
                this.geoJsonLayer.removeLayer(layer);
            }
        }
    });
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
            this.isPointInsidePolygon([marker.lat, marker.lng], shape)
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

    /**
     * Checks if a point is inside a Leaflet Polygon using `leaflet-pip`
     * @param {Array} point - [lat, lng] of the marker
     * @param {L.Polygon} polygon - Leaflet Polygon object
     * @returns {boolean} - True if the point is inside the polygon
     */
    isPointInsidePolygon(point, polygon) {
        return leafletPip.pointInLayer(point, polygon).length > 0;
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
