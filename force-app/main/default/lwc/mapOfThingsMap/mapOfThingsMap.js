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

    // Markers are assumed to be rendered by a separate markers component.
    // They are still passed in here so that we can filter the shapefile
    // and only show polygons that contain a marker.
    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            // Simply store them; do not render duplicate marker icons here.
            this._markers = [...newMarkers];
            // Once the shapefile is loaded, re-run filtering so label visibility can update.
            if (this.geoJsonLayer) {
                this.filterPolygons();
            }
        }
    }

    get markersExist() {
        return this._markers && this._markers.length > 0;
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

        // Add the tile layer.
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Note: We remove our internal marker creation so that duplicate markers do not appear.
        // It is assumed that a separate markers LWC (mapOfThingsMarkers) is already adding markers to the map.
        // But filtering of polygons will look at all markers (except our own labels) on the map.

        // Create a dedicated layer for labels.
        this.labelLayer = L.layerGroup().addTo(this.map);

        // Render the shapefile layer.
        await this.renderShapefile();

        // Dispatch an event to signal that the map is fully initialized.
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
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

            // Add the GeoJSON layer but start with all polygons hidden.
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: function () {
                    return {
                        opacity: 0,
                        fillOpacity: 0,
                        pointerEvents: 'none'
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        // Create the popup content.
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });

                        // Instead of adding the label marker immediately to the map,
                        // we create it and store it in the layer. The label uses a divIcon.
                        const labelText = feature.properties.NAME;
                        const centroid = layer.getBounds().getCenter();
                        layer.myLabel = L.marker(centroid, {
                            icon: L.divIcon({
                                className: 'shapefile-label',
                                html: labelText,
                                iconSize: [100, 20]
                            })
                        });
                    }
                }
            }).addTo(this.map);

            // Once the shapefile is loaded, filter the polygons so that only those with a marker inside are visible.
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
     * Check if a polygon layer (from the shapefile) contains at least one marker.
     * Instead of using a separate marker layer, we iterate over every layer in the map.
     * We filter out markers that are actually labels (by checking if their icon’s className contains "shapefile-label").
     */
    checkPolygonForMarkers(polygonLayer) {
        let hasMarkerInside = false;
        // Iterate over all layers on the map.
        this.map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                // Check if this marker uses a divIcon with the "shapefile-label" class.
                if (
                    layer.options &&
                    layer.options.icon &&
                    layer.options.icon.options &&
                    layer.options.icon.options.className &&
                    layer.options.icon.options.className.includes('shapefile-label')
                ) {
                    // Skip label markers.
                    return;
                }
                const markerLatLng = layer.getLatLng();
                // First check the bounding box.
                if (polygonLayer.getBounds().contains(markerLatLng) && this.pointInPolygon(markerLatLng, polygonLayer)) {
                    hasMarkerInside = true;
                }
            }
        });
        return hasMarkerInside;
    }

    /**
     * Standard ray-casting algorithm to determine if a point (marker) lies inside a polygon.
     */
    pointInPolygon(point, polygonLayer) {
        // Get the polygon’s latlngs.
        const latlngs = polygonLayer.getLatLngs();
        if (!latlngs || !latlngs.length) {
            return false;
        }
        // For a simple polygon, assume the first set of coordinates.
        const polygon = latlngs[0];
        let inside = false;
        const x = point.lng,
            y = point.lat;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng,
                yi = polygon[i].lat;
            const xj = polygon[j].lng,
                yj = polygon[j].lat;
            const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Loop through each polygon in the GeoJSON layer. For each polygon,
     * update its style based on whether it contains a marker. Then add or remove
     * the associated label marker accordingly.
     */
    filterPolygons() {
        if (!this.geoJsonLayer) return;
        this.geoJsonLayer.eachLayer(layer => {
            // Only act on features that are polygons.
            if (layer.feature && layer.feature.geometry.type.includes('Polygon')) {
                const shouldShow = this.checkPolygonForMarkers(layer);
                layer.setStyle({
                    opacity: shouldShow ? 1 : 0,
                    fillOpacity: shouldShow ? 0.5 : 0,
                    pointerEvents: shouldShow ? 'auto' : 'none'
                });
                if (layer.redraw) layer.redraw();

                // Now show or hide the label based on the polygon's visibility.
                if (layer.myLabel) {
                    if (shouldShow) {
                        // If the label is not already added, add it.
                        if (!layer.myLabel._map) {
                            layer.myLabel.addTo(this.labelLayer);
                        }
                    } else {
                        // Remove the label from the labelLayer if it exists.
                        if (layer.myLabel._map) {
                            this.labelLayer.removeLayer(layer.myLabel);
                        }
                    }
                }
            }
        });
    }
}
