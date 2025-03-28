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

    // The markers property is set by a parent or sibling component.
    // These marker objects (with keys "lat" and "lng") will be used for filtering shapes.
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

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create a dedicated layer for shape labels.
        this.labelLayer = L.layerGroup().addTo(this.map);

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

            // Add the GeoJSON layer with all polygons hidden initially.
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
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });

                        // Compute the polygon's bounds center.
                        const boundsCenter = layer.getBounds().getCenter();

                        // Start with a default label position as the bounds center.
                        let labelLatLng = boundsCenter;

                        // Find all markers (from the _markers array) that lie inside this polygon.
                        let insideMarkers = [];
                        if (this._markers && this._markers.length > 0) {
                            this._markers.forEach(m => {
                                const pt = L.latLng(m.lat, m.lng);
                                if (layer.getBounds().contains(pt) && this.pointInPolygon(pt, layer)) {
                                    insideMarkers.push(pt);
                                }
                            });
                        }

                        // If there are markers inside the polygon, offset the label away from them.
                        if (insideMarkers.length > 0) {
                            let sumLat = 0, sumLng = 0;
                            insideMarkers.forEach(pt => {
                                sumLat += pt.lat;
                                sumLng += pt.lng;
                            });
                            let avgMarker = L.latLng(sumLat / insideMarkers.length, sumLng / insideMarkers.length);
                            
                            // Compute the vector in layer coordinates from the average marker point to the bounds center.
                            const centerPoint = this.map.latLngToLayerPoint(boundsCenter);
                            const markerPoint = this.map.latLngToLayerPoint(avgMarker);
                            let vector = {
                                x: centerPoint.x - markerPoint.x,
                                y: centerPoint.y - markerPoint.y
                            };
                            let len = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
                            // If the markers and center are at the same point, choose a default upward offset.
                            if (len === 0) {
                                vector = { x: 0, y: -20 };
                            } else {
                                // Normalize and then scale to 20 pixels.
                                vector.x = (vector.x / len) * 20;
                                vector.y = (vector.y / len) * 20;
                            }
                            const offsetPoint = L.point(centerPoint.x + vector.x, centerPoint.y + vector.y);
                            let candidate = this.map.layerPointToLatLng(offsetPoint);
                            // Use the candidate if it lies inside the polygon.
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        } else {
                            // If no markers inside, offset slightly upward by default.
                            const centerPoint = this.map.latLngToLayerPoint(boundsCenter);
                            const offsetPoint = L.point(centerPoint.x, centerPoint.y - 20);
                            let candidate = this.map.layerPointToLatLng(offsetPoint);
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        }

                        // Create the label marker with updated (bold) styling.
                        // The HTML uses inline CSS so that the text appears more visible.
                        const labelText = feature.properties.NAME;
                        layer.myLabel = L.marker(labelLatLng, {
                            icon: L.divIcon({
                                html: `<span style="font-weight: bold; color: black; background: rgba(255,255,255,0.8); padding: 2px 4px; border-radius: 3px;">${labelText}</span>`,
                                className: 'shapefile-label',
                                iconSize: [100, 20],
                                iconAnchor: [50, 0]
                            })
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
     * Checks whether a given point is inside a polygon using the standard ray-casting algorithm.
     */
    pointInPolygon(point, polygonLayer) {
        const latlngs = polygonLayer.getLatLngs();
        if (!latlngs || !latlngs.length) {
            return false;
        }
        // Assume a simple polygon (the first array of coordinates).
        const polygon = latlngs[0];
        let inside = false;
        const x = point.lng;
        const y = point.lat;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng, yi = polygon[i].lat;
            const xj = polygon[j].lng, yj = polygon[j].lat;
            const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * For every polygon in the GeoJSON layer, set its style and add (or remove) its label marker based on whether it contains markers.
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
     * Check if a polygon layer contains at least one marker from the _markers array.
     */
    checkPolygonForMarkers(polygonLayer) {
        if (!this._markers || this._markers.length === 0) {
            return false;
        }
        let hasMarkerInside = false;
        this._markers.forEach(markerData => {
            const markerLatLng = L.latLng(markerData.lat, markerData.lng);
            if (polygonLayer.getBounds().contains(markerLatLng) && this.pointInPolygon(markerLatLng, polygonLayer)) {
                hasMarkerInside = true;
            }
        });
        return hasMarkerInside;
    }
}
