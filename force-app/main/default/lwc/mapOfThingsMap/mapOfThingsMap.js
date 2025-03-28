import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL       = '/leaflet.css';
const LEAFLET_JS_URL        = '/leaflet.js';
const LEAFLETADDON_JS_URL   = '/leafletjs_marker_rotate_addon.js';
const CATILINE_JS_URL       = '/catiline.js';
const SHP_JS_URL            = '/shp.js';
const SHPFILE_JS_URL        = '/leaflet.shpfile.js';

const MIN_ZOOM              = 2;
const FIT_BOUNDS_PADDING    = [20, 20];
const MAP_CONTAINER         = 'div.inner-map-container';
const CUSTOM_EVENT_INIT     = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;

    // External marker objects (each with at least "lat" and "lng") are provided for filtering.
    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.geoJsonLayer) {
                this.filterPolygons();
            }
        }
    }

    renderedCallback() {
        this.template.querySelector(MAP_CONTAINER).style.height = this.mapSizeY;
    }

    async connectedCallback() {
        try {
            // Load external CSS and JS sequentially so that libraries load in order.
            // 1. Load Leaflet CSS.
            await loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL);
            // 2. Load core Leaflet JS.
            await loadScript(this, LEAFLET_JS + LEAFLET_JS_URL);
            // 3. Load the addon and dependencies in order.
            await loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL);
            await loadScript(this, LEAFLET_JS + CATILINE_JS_URL);
            await loadScript(this, LEAFLET_JS + SHP_JS_URL);
            await loadScript(this, LEAFLET_JS + SHPFILE_JS_URL);
            // Now that the scripts are loaded sequentially, window.L should be defined.
            if (!window.L) {
                throw new Error('Leaflet library was not properly attached to window');
            }
            this.drawMap();
        } catch (error) {
            console.error('Error loading external libraries:', error);
        }
    }

    async drawMap() {
        const container = this.template.querySelector(MAP_CONTAINER);
        // Initialize the map using window.L.
        this.map = window.L.map(container, {
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Create a pane for labels with a high z-index and no pointer events.
        this.map.createPane('labelsPane');
        const labelsPane = this.map.getPane('labelsPane');
        labelsPane.style.zIndex = 650; // Higher than normal marker layers.
        labelsPane.style.pointerEvents = 'none';

        window.L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create a dedicated layer for labels, specifying the custom pane.
        this.labelLayer = window.L.layerGroup([], { pane: 'labelsPane' }).addTo(this.map);

        await this.renderShapefile();

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

            // Add the shapefile as a GeoJSON layer; polygons are initially hidden.
            this.geoJsonLayer = window.L.geoJSON(geojson, {
                style: function () {
                    return {
                        opacity: 0,
                        fillOpacity: 0,
                        pointerEvents: 'none'
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
    
                        // Determine a suitable label position. Start with the polygon's bounds center.
                        const boundsCenter = layer.getBounds().getCenter();
                        let labelLatLng = boundsCenter;
    
                        // Check markers (from _markers array) that lie inside this polygon.
                        let insideMarkers = [];
                        if (this._markers && this._markers.length > 0) {
                            this._markers.forEach(m => {
                                const pt = window.L.latLng(m.lat, m.lng);
                                if (layer.getBounds().contains(pt) && this.pointInPolygon(pt, layer)) {
                                    insideMarkers.push(pt);
                                }
                            });
                        }
    
                        if (insideMarkers.length > 0) {
                            let sumLat = 0, sumLng = 0;
                            insideMarkers.forEach(pt => {
                                sumLat += pt.lat;
                                sumLng += pt.lng;
                            });
                            let avgMarker = window.L.latLng(sumLat / insideMarkers.length, sumLng / insideMarkers.length);
    
                            // Compute a vector (in layer coordinates) from the average marker position to the polygon center.
                            const centerPt = this.map.latLngToLayerPoint(boundsCenter);
                            const markerPt = this.map.latLngToLayerPoint(avgMarker);
                            let vector = {
                                x: centerPt.x - markerPt.x,
                                y: centerPt.y - markerPt.y
                            };
                            let len = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
                            if (len === 0) {
                                vector = { x: 0, y: -20 };
                            } else {
                                vector.x = (vector.x / len) * 20;
                                vector.y = (vector.y / len) * 20;
                            }
                            const offsetPoint = window.L.point(centerPt.x + vector.x, centerPt.y + vector.y);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        } else {
                            // If there are no markers, try shifting upward by 20 pixels.
                            const centerPt = this.map.latLngToLayerPoint(boundsCenter);
                            const offsetPoint = window.L.point(centerPt.x, centerPt.y - 20);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        }
    
                        // Create the label marker with bold, high-contrast styling.
                        // It is added to the 'labelsPane' so it appears above marker icons while remaining non‑interactive.
                        const labelText = feature.properties.NAME;
                        layer.myLabel = window.L.marker(labelLatLng, {
                            pane: 'labelsPane',
                            icon: window.L.divIcon({
                                html: `<span style="font-weight: bold; color: black; background: rgba(255,255,255,0.8); padding: 2px 4px; border-radius: 3px; pointer-events: none;">${labelText}</span>`,
                                className: 'shapefile-label',
                                iconSize: [100, 20],
                                iconAnchor: [50, 0]
                            }),
                            interactive: false
                        });
                    }
                }
            }).addTo(this.map);
    
            if (this.markers && this.markers.length > 0) {
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
     * Standard ray-casting algorithm: returns true if the point lies inside the polygon.
     */
    pointInPolygon(point, polygonLayer) {
        const latlngs = polygonLayer.getLatLngs();
        if (!latlngs || !latlngs.length) {
            return false;
        }
        // Assume a simple polygon (use the first coordinate set).
        const polygon = latlngs[0];
        let inside = false;
        const x = point.lng;
        const y = point.lat;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng, yi = polygon[i].lat;
            const xj = polygon[j].lng, yj = polygon[j].lat;
            const intersect = ((yi > y) !== (yj > y)) &&
                              (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }
    
    /**
     * Loop over each polygon in the GeoJSON layer to update its style and add or remove its label,
     * based on whether the polygon contains any marker from the _markers array.
     */
    filterPolygons() {
        if (!this.geoJsonLayer) {
            return;
        }
        this.geoJsonLayer.eachLayer(layer => {
            if (layer.feature && layer.feature.geometry.type.includes('Polygon')) {
                const shouldShow = this.checkPolygonForMarkers(layer);
                layer.setStyle({
                    opacity: shouldShow ? 1 : 0,
                    fillOpacity: shouldShow ? 0.5 : 0,
                    pointerEvents: shouldShow ? 'auto' : 'none'
                });
                if (layer.redraw) {
                    layer.redraw();
                }
                if (layer.myLabel) {
                    if (shouldShow) {
                        if (!layer.myLabel._map) {
                            layer.myLabel.addTo(this.labelLayer);
                        }
                    } else {
                        if (layer.myLabel._map) {
                            this.labelLayer.removeLayer(layer.myLabel);
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Returns true if the given polygon layer contains at least one marker from _markers.
     */
    checkPolygonForMarkers(polygonLayer) {
        if (!this._markers || this._markers.length === 0) {
            return false;
        }
        let hasMarkerInside = false;
        this._markers.forEach(markerData => {
            const markerLatLng = window.L.latLng(markerData.lat, markerData.lng);
            if (
                polygonLayer.getBounds().contains(markerLatLng) &&
                this.pointInPolygon(markerLatLng, polygonLayer)
            ) {
                hasMarkerInside = true;
            }
        });
        return hasMarkerInside;
    }
}
