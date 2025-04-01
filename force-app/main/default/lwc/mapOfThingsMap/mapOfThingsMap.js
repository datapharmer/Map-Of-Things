import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';
import { ShowToastEvent } from 'lightning/platformShowToastEvent'; // Import ShowToastEvent

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER_ID = 'map-root'; // Use an ID instead of a query selector
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];
    leafletResourcesLoaded = false;
    mapInitialized = false; // Track if the map has been initialized
    mapRoot;  // Store the map root element

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
            if (this.geoJsonLayer && this.leafletResourcesLoaded && this.mapInitialized) {
                this.filterPolygons();
            }
        }
    }
connectedCallback() {
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        this.template.addEventListener('click', this.handlePointerEvent.bind(this));
    } else {
        this.template.addEventListener('pointerdown', this.handlePointerEvent.bind(this));
        this.template.addEventListener('pointermove', this.handlePointerEvent.bind(this));
        this.template.addEventListener('pointerup', this.handlePointerEvent.bind(this));
    }
}

renderedCallback() {
    if (!this.mapRoot) {
        // Log the template’s content for debugging
        console.log('Template innerHTML:', this.template.innerHTML);

        // Try to find the container element
        this.mapRoot = this.template.querySelector('.inner-map-container');
        if (this.mapRoot) {
            this.mapRoot.id = MAP_CONTAINER_ID;
            this.mapRoot.style.height = this.mapSizeY;
            this.loadLeafletResources();
        } else {
            console.error('Map container not found.');
        }
    }
}

    async loadLeafletResources() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
                loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL),
                loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
            ]).then(() => {
                this.leafletResourcesLoaded = true;

                // Add pointer event listeners
                this.template.addEventListener('pointerdown', this.handlePointerEvent.bind(this));
                this.template.addEventListener('pointermove', this.handlePointerEvent.bind(this));
                this.template.addEventListener('pointerup', this.handlePointerEvent.bind(this));

                this.drawMap();
            }).catch(error => {
                console.error('Error loading external libraries:', error);
                this.showErrorToast('Error loading external libraries: ' + error.message);
            });

        } catch (error) {
            console.error('Error loading external libraries:', error);
            this.showErrorToast('Error loading external libraries: ' + error.message);
        }
    }
handlePointerEvent(event) {
    // Skip processing if the map isn't ready
    if (!this.map) {
        return;
    }

    // Handle events differently for Firefox
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        if (event.type === 'click') {
            // Perform operations only on click in Firefox
        }
    } else {
        if (event.pointerType === 'mouse') {
            // Handle pointer events for other browsers
        }
    }
}


    async drawMap() {
        if (!this.leafletResourcesLoaded) {
            console.warn('Leaflet resources not yet loaded.');
            return;
        }

        this.map = L.map(MAP_CONTAINER_ID, { // Initialize using the ID
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Create a new pane for labels having a high z-index and disable pointer events so that markers are clickable.
        this.map.createPane('labelsPane');
        const labelsPane = this.map.getPane('labelsPane');
        labelsPane.style.zIndex = 650; // ensure labels are above normal marker panes
        labelsPane.style.pointerEvents = 'none';
        labelsPane.style.setProperty('pointer-events', 'none');

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create a dedicated label layer on the labels pane.
        this.labelLayer = L.layerGroup([], { pane: 'labelsPane' }).addTo(this.map);

        await this.renderShapefile();

        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
        this.mapInitialized = true; // Set the flag after successful map initialization
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
                        const popupContent = this.generatePopupContent(feature.properties);
                        const popupElement = document.createElement('div');
                        popupElement.innerHTML = popupContent;
                        layer.bindPopup(popupElement, { maxHeight: 200 });


                        // Compute the polygon's bounds center.
                        const boundsCenter = layer.getBounds().getCenter();

                        // Default label position is the center.
                        let labelLatLng = boundsCenter;

                        // Find markers (from _markers) that lie inside this polygon.
                        let insideMarkers = [];
                        if (this._markers && this._markers.length > 0) {
                            this._markers.forEach(m => {
                                const pt = L.latLng(m.lat, m.lng);
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
                            let avgMarker = L.latLng(sumLat / insideMarkers.length, sumLng / insideMarkers.length);

                            // Compute vector in layer coordinates from average marker position to polygon center.
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
                            const offsetPoint = L.point(centerPt.x + vector.x, centerPt.y + vector.y);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        } else {
                            // If no markers inside, offset slightly upward.
                            const centerPt = this.map.latLngToLayerPoint(boundsCenter);
                            const offsetPoint = L.point(centerPt.x, centerPt.y - 20);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            if (this.pointInPolygon(candidate, layer)) {
                                labelLatLng = candidate;
                            } else {
                                labelLatLng = boundsCenter;
                            }
                        }

                        // Create the label marker with bold styling.
                        // Specify pane 'labelsPane' so that the label appears atop markers.
                        const labelText = feature.properties.NAME;
                        layer.myLabel = L.marker(labelLatLng, {
                            pane: 'labelsPane',
                            icon: L.divIcon({
                                html: `<span style="font-weight: bold; color: black; background: rgba(255,255,255,0.5); padding: 2px 4px; border-radius: 3px; pointer-events: none; width: auto; user-select: none;">${labelText}</span>`,
                                className: `shapefile-label`,
                                iconSize: [100, 20],
                                iconAnchor: [50, 0]
                            }),
                            interactive: false // ensures the label itself does not intercept mouse events
                        });
                    }
                }
            }).addTo(this.map);

            if (this.markers && this.markers.length > 0 && this.leafletResourcesLoaded && this.mapInitialized) {
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
            this.showErrorToast('Error loading or parsing shapefile: ' + error.message);
        }
    }

    sanitizeString(str) {
        const element = document.createElement('div');
        element.textContent = str;
        return element.innerHTML;
    }

generatePopupContent(properties) {
    let content = '';
    for (const key in properties) {
        if (properties.hasOwnProperty(key)) {
            // Use textContent instead of innerHTML to avoid DOM parsing
            const element = document.createElement('div');
            element.textContent = `${key}: ${properties[key]}`;
            content += element.outerHTML;
        }
    }
    return content;
}

    pointInPolygon(point, polygonLayer) {
        const latlngs = polygonLayer.getLatLngs();
        if (!latlngs || !latlngs.length) {
            return false;
        }
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

    // Helper function to show toast messages
    showErrorToast(message) {
        const event = new ShowToastEvent({
            title: 'Error',
            message: message,
            variant: 'error',
            mode: 'sticky'
        });
        this.dispatchEvent(event);
    }
}
