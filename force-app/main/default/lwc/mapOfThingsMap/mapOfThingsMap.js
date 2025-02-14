import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const TURF_JS_URL = '/turf.js';
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
    markerLayer = null; // Layer for markers
    geoJsonLayer = null; // Layer for polygons
    shapefileLoaded = false;
    markersLoaded = false;

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
            this.markersLoaded = true;
            if (this.map) {
                this.updateMarkers();
            }
        }
    }

    renderedCallback() {
        this.template.querySelector('MAP_CONTAINER').style.height = this.mapSizeY;
    }

    async connectedCallback() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + TURF_JS_URL),
				loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
                loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL),
				loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
            ]);
            this.initializeMap();
        } catch (error) {
            console.error('Error loading libraries:', error);
        }
    }

    async initializeMap() {
        const container = this.template.querySelector('MAP_CONTAINER');
        this.map = L.map(container).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Add tile layer
        L.tileLayer(this.tileServerUrl, {
            attribution: this.tileServerAttribution,
            minZoom: 2
        }).addTo(this.map);

        // Load and render both markers and shapefile
        await Promise.all([this.updateMarkers(), this.renderShapefile()]);
    }

    async updateMarkers() {
        // Clear existing markers to prevent duplicates
        if (this.markerLayer) {
            this.map.removeLayer(this.markerLayer);
        }

        // Create a new layer group for markers
        this.markerLayer = L.layerGroup();

        this._markers.forEach(marker => {
            const leafletMarker = L.marker([marker.lat, marker.lng], {
                title: marker.title || ''
            });

            if (marker.popupContent) {
                leafletMarker.bindPopup(marker.popupContent);
            }

            this.markerLayer.addLayer(leafletMarker);
        });

        // Add the marker layer to the map
        this.markerLayer.addTo(this.map);

        // Auto fit bounds if markers exist
        if (this.autoFitBounds && this._markers.length > 0) {
            const bounds = L.latLngBounds(this._markers.map(m => [m.lat, m.lng]));
            this.map.fitBounds(bounds);
        }

        this.markersLoaded = true;

        // Filter polygons after markers are updated
        this.filterPolygons();
    }

    async renderShapefile() {
        try {
            const response = await fetch(SCHOOLDISTRICTS_ZIP);
            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            console.log('Loaded GeoJSON:', geojson);

            // Create a GeoJSON layer
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: {
                    color: '#CC5500',
                    weight: 2,
                    fillOpacity: 0.5
                }
            }).addTo(this.map);

            this.shapefileLoaded = true;

            // Filter polygons after shapefile is loaded
            this.filterPolygons();
        } catch (error) {
            console.error('Error loading shapefile:', error);
        }
    }

filterPolygons() {
    if (!this.shapefileLoaded || !this.markersLoaded) {
        console.warn('Markers or shapefile not yet loaded.');
        return;
    }

    if (this.geoJsonLayer) {
        const markerLatLngs = this._markers.map(marker => [marker.lng, marker.lat]); // Convert to GeoJSON [lng, lat] format

        console.log('Marker coordinates (GeoJSON format):', markerLatLngs);

        this.geoJsonLayer.eachLayer(layer => {
            if (layer instanceof L.Polygon) {
                const polygonCoordinates = layer.feature.geometry.coordinates;

                // Check if any marker is inside the polygon using Turf.js
                const hasMarkerInside = markerLatLngs.some(markerCoords =>
                    pointInPolygon(markerCoords, layer.feature)
                );

                if (!hasMarkerInside) {
                    console.log('Hiding polygon:', layer.feature.properties || 'No properties');
                    layer.setStyle({ fillOpacity: 0, opacity: 0 });
                } else {
                    console.log('Polygon remains visible:', layer.feature.properties || 'No properties');
                }
            }
        });
    } else {
        console.error('GeoJSON layer is not initialized.');
    }
}
    
}
