import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const SHP_JS_URL = '/shp.js';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];
    markerLayer = null; // Layer to hold markers
    geoJsonLayer = null; // Layer to hold polygons
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
            this.markersLoaded = true; // Mark as loaded
            if (this.map) {
                this.renderMarkers().then(() => {
                    this.filterPolygons(); // Filter polygons once markers are updated
                });
            }
        }
    }

    renderedCallback() {
        this.template.querySelector('div.inner-map-container').style.height = this.mapSizeY;
    }

    async connectedCallback() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL)
            ]);
            this.drawMap();
        } catch (error) {
            console.error('Error loading libraries:', error);
        }
    }

    async drawMap() {
        const container = this.template.querySelector('div.inner-map-container');
        this.map = L.map(container).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Add tile layer
        L.tileLayer(this.tileServerUrl, {
            attribution: this.tileServerAttribution,
            minZoom: 2
        }).addTo(this.map);

        // Render markers and shapefile together
        await Promise.all([this.renderMarkers(), this.renderShapefile()]);

        // Filter polygons after both are loaded
        this.filterPolygons();
    }

    async renderMarkers() {
        // Clear existing markers to avoid duplicates
        if (this.markerLayer) {
            this.map.removeLayer(this.markerLayer);
        }

        // Create a new layer group for markers
        this.markerLayer = L.layerGroup(
            this.markers.map(marker => {
                return L.marker([marker.lat, marker.lng], {
                    title: marker.title || ''
                }).bindPopup(marker.popupContent || '');
            })
        );

        // Add the marker layer to the map
        this.markerLayer.addTo(this.map);

        // Auto fit bounds if enabled
        if (this.autoFitBounds && this.markersExist) {
            const bounds = L.latLngBounds(this.markers.map(marker => [marker.lat, marker.lng]));
            this.map.fitBounds(bounds);
        }

        this.markersLoaded = true; // Mark markers as loaded
    }

    async renderShapefile() {
        try {
            const response = await fetch(SCHOOLDISTRICTS_ZIP);
            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // Add GeoJSON to the map
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: {
                    color: '#CC5500',
                    weight: 2,
                    fillOpacity: 0.5
                }
            }).addTo(this.map);

            this.shapefileLoaded = true; // Mark shapefile as loaded
        } catch (error) {
            console.error('Error loading shapefile:', error);
        }
    }

    filterPolygons() {
        // Ensure both markers and shapefile are loaded
        if (!this.shapefileLoaded || !this.markersLoaded) {
            return;
        }

        if (this.geoJsonLayer) {
            const markerLatLngs = this.markers.map(marker => L.latLng(marker.lat, marker.lng));

            // Iterate through each feature in the GeoJSON layer
            this.geoJsonLayer.eachLayer(layer => {
                // Check if the layer is a valid polygon
                if (layer instanceof L.Polygon && layer.getBounds) {
                    const polygonBounds = layer.getBounds();

                    // Check if any marker falls inside the polygon bounds
                    const hasMarkerInside = markerLatLngs.some(latlng => polygonBounds.contains(latlng));

                    // Hide the polygon if no markers are inside
                    if (!hasMarkerInside) {
                        layer.setStyle({ fillOpacity: 0, opacity: 0 }); // Hide the polygon
                    }
                } else {
                    console.warn('Skipping non-polygon layer:', layer);
                }
            });
        } else {
            console.error('GeoJSON layer not found!');
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
    }
}
