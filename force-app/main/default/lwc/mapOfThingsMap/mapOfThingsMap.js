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

    // The markers property is expected to be an array of marker objects, for example:
    // [{ id: 'marker1', lat: 34.05, lng: -118.25, popup: 'Hello World' },...]
    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.map) {
                this.renderMarkers();
                // If the shapefile has already been loaded, re-run filtering
                if (this.geoJsonLayer) {
                    this.filterPolygons();
                }
            }
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
    }

    get bounds() {
        if (this.markersExist) {
            return this.markers.map(marker => [marker.lat, marker.lng]);
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

        // Create a dedicated layer for markers so that polygon filtering works correctly.
        this.markerLayer = L.layerGroup().addTo(this.map);

        // Add the tile layer.
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Render markers (if any) BEFORE loading the shapefile layer.
        if (this.markersExist) {
            this.renderMarkers();
        }

        // Render the shapefile layer and then filter the shapes.
        await this.renderShapefile();

        // Dispatch a custom event to notify that the map is initialized.
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

    /**
     * Render markers into a dedicated Leaflet layer (markerLayer) so that we can later test 
     * which shapefile polygons contain a marker.
     */
    renderMarkers() {
        if (this.markerLayer) {
            this.markerLayer.clearLayers();
        } else {
            this.markerLayer = L.layerGroup().addTo(this.map);
        }
        this._markers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);
            if (markerData.popup) {
                marker.bindPopup(markerData.popup);
            }
            marker.addTo(this.markerLayer);
        });
    }

    async renderShapefile() {
        try {
            const shpfile = SCHOOLDISTRICTS_ZIP;
            const response = await fetch(shpfile);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // Create a separate layer group for labels.
            this.labelLayer = L.layerGroup().addTo(this.map);

            // Add the GeoJSON layer. Start with the polygons hidden.
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: function(feature) {
                    return {
                        opacity: 0,
                        fillOpacity: 0,
                        pointerEvents: 'none'
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        const labelText = feature.properties.NAME;
                        const centroid = layer.getBounds().getCenter();

                        // Add labels to the explicit label layer.
                        L.marker(centroid, {
                            icon: L.divIcon({
                                className: 'shapefile-label',
                                html: labelText,
                                iconSize: [100, 20]
                            })
                        }).addTo(this.labelLayer);

                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                    }
                }
            }).addTo(this.map);

            // Once the shapefile is loaded, filter the polygons so that only those with a marker inside are displayed.
            if (this.markersExist) {
                this.filterPolygons();
            }

            if (this.autoFitBounds) {
                const bounds = this.geoJsonLayer.getBounds();
                if (bounds.isValid()) {
                    this.map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING });
                }
            }
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
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

    /**
     * Check if a given polygon (layer) contains at least one marker.
     * It uses the polygon’s bounds and a point-in-polygon check.
     */
    checkPolygonForMarkers(layer) {
        if (!this.markerLayer) return false;

        let hasMarkerInside = false;
        this.markerLayer.eachLayer(marker => {
            if (hasMarkerInside) return;
            const markerLatLng = marker.getLatLng();
            // First check that the marker is within the polygon's bounding box.
            if (layer.getBounds().contains(markerLatLng) && this.pointInPolygon(markerLatLng, layer)) {
                hasMarkerInside = true;
            }
        });
        return hasMarkerInside;
    }

    /**
     * Determine if a Leaflet point (marker) lies inside a polygon layer.
     * Uses the ray-casting algorithm.
     */
    pointInPolygon(point, layer) {
        // Get the polygon’s latlngs. For GeoJSON features added via L.geoJSON, the coordinates
        // are stored as an array (or nested array for MultiPolygon). We assume a single polygon here.
        const latlngs = layer.getLatLngs();
        if (!latlngs || !latlngs.length) {
            return false;
        }
        // For a simple polygon, use the first set of coordinates.
        const polygon = latlngs[0];
        let inside = false;
        const x = point.lng,
            y = point.lat;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng,
                yi = polygon[i].lat;
            const xj = polygon[j].lng,
                yj = polygon[j].lat;
            const intersect =
                (yi > y) !== (yj > y) &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Iterate over each polygon in the shapefile layer. For polygons that contain at least one
     * marker (as determined by checkPolygonForMarkers), the polygon’s style is set to be visible.
     * Otherwise, the polygon remains hidden.
     */
    filterPolygons() {
        if (!this.geoJsonLayer || !this.markerLayer) return;
        this.geoJsonLayer.eachLayer(layer => {
            if (layer.feature && layer.feature.geometry.type.includes('Polygon')) {
                const shouldShow = this.checkPolygonForMarkers(layer);
                layer.setStyle({
                    opacity: shouldShow ? 1 : 0,
                    fillOpacity: shouldShow ? 0.5 : 0,
                    pointerEvents: shouldShow ? 'auto' : 'none'
                });
                if (layer.redraw) layer.redraw();
            }
        });
    }
}
