import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';
const SHP_JS_URL = '/shp.js';
const SHPFILE_ADDITIONAL_JS_URL = '/leaflet.shpfile.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];
    leafletResourcesLoaded = false;
    mapInitialized = false;
    
    // API properties for tile config are already declared.
    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;

    // API properties for shapefile configuration.
    @api shapefileResourceName; // expected to be the static resource name (e.g., "schooldistricts")
    @api shapefileColor;        // either a valid CSS color (e.g. "blue") or "random"

    @api showAllShapes = false; // Default value

    // Computed property for the button variant
    get buttonVariant() {
        return this.showAllShapes ? 'brand' : 'neutral';
    }
    
    toggleShapeVisibility() {
        this.showAllShapes = !this.showAllShapes;
    }

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
    
    // Cache the pointer event handler (avoid duplicate binding)
    pointerEventHandler = this.handlePointerEvent.bind(this);

    connectedCallback() {
        // Register pointer events just once
        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            this.template.addEventListener('click', this.pointerEventHandler);
        } else {
            this.template.addEventListener('pointerdown', this.pointerEventHandler);
            this.template.addEventListener('pointermove', this.pointerEventHandler);
            this.template.addEventListener('pointerup', this.pointerEventHandler);
        }
        
        this.loadLeafletResources();
    }

    renderedCallback() {
        const container = this.template.querySelector(MAP_CONTAINER);
        if (container) {
            container.style.height = this.mapSizeY;
        }
    }

async loadLeafletResources() {
    try {
        // Always load the CSS first
        await loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL);
        // Then load the scripts sequentially so “L” is defined when addon code runs
        await loadScript(this, LEAFLET_JS + LEAFLET_JS_URL);
        await loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL);
        await loadScript(this, LEAFLET_JS + CATILINE_JS_URL);
        await loadScript(this, LEAFLET_JS + SHP_JS_URL);
        await loadScript(this, LEAFLET_JS + SHPFILE_ADDITIONAL_JS_URL);
        
        this.leafletResourcesLoaded = true;
        this.drawMap();
    } catch (error) {
        console.error('Error loading external libraries:', error);
        this.showErrorToast('Error loading external libraries: ' + error.message);
    }
}


    handlePointerEvent(event) {
        if (!this.map) {
            return;
        }
        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && event.pointerType !== 'mouse') {
            return;
        }
        // Process pointer events as needed...
    }

    async drawMap() {
        if (!this.leafletResourcesLoaded) {
            console.warn('Leaflet resources not yet loaded.');
            return;
        }
        const container = this.template.querySelector(MAP_CONTAINER);
        if (!container) {
            console.error('Map container not found.');
            return;
        }
        this.map = L.map(container, { 
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Create pane for labels
        this.map.createPane('labelsPane');
        const labelsPane = this.map.getPane('labelsPane');
        labelsPane.style.zIndex = 650;
        labelsPane.style.pointerEvents = 'none';

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create layer group for labels.
        this.labelLayer = L.layerGroup([], { pane: 'labelsPane' }).addTo(this.map);

        await this.renderShapefile();

        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
        this.mapInitialized = true;
    }

    async renderShapefile() {
        // Construct the URL for the shapefile using the configured static resource name.
        const resourceName = this.shapefileResourceName ? this.shapefileResourceName : 'schooldistricts';
        // In Salesforce, static resources are accessible at '/resource/<namespace>[/<file>]' (here we assume no namespace)
        const shapefileUrl = `/resource/${resourceName}`;// Adjust the path if needed (e.g. '/resource/<id>/...')
        
        try {
            const response = await fetch(shapefileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch static resource "${resourceName}": ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // When creating the GeoJSON layer, use an initial style that is hidden.
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: () => ({
                    opacity: 0,
                    fillOpacity: 0,
                    pointerEvents: 'none'
                }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        const popupContent = this.generatePopupContent(feature.properties);
                        const popupElement = document.createElement('div');
                        popupElement.innerHTML = popupContent;
                        layer.bindPopup(popupElement, { maxHeight: 200 });

                        const boundsCenter = layer.getBounds().getCenter();
                        let labelLatLng = boundsCenter;
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
                            const centerPt = this.map.latLngToLayerPoint(boundsCenter);
                            const markerPt = this.map.latLngToLayerPoint(avgMarker);
                            let vector = { x: centerPt.x - markerPt.x, y: centerPt.y - markerPt.y};
                            let len = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
                            if (len === 0) {
                                vector = { x: 0, y: -20 };
                            } else {
                                vector.x = (vector.x / len) * 20;
                                vector.y = (vector.y / len) * 20;
                            }
                            const offsetPoint = L.point(centerPt.x + vector.x, centerPt.y + vector.y);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            labelLatLng = (this.pointInPolygon(candidate, layer)) ? candidate : boundsCenter;
                        } else {
                            const centerPt = this.map.latLngToLayerPoint(boundsCenter);
                            const offsetPoint = L.point(centerPt.x, centerPt.y - 20);
                            const candidate = this.map.layerPointToLatLng(offsetPoint);
                            labelLatLng = (this.pointInPolygon(candidate, layer)) ? candidate : boundsCenter;
                        }
                        const labelText = feature.properties.NAME;
                        layer.myLabel = L.marker(labelLatLng, {
                            pane: 'labelsPane',
                            icon: L.divIcon({
                                html: `<span style="font-weight: bold; color: black; background: rgba(255,255,255,0.5); padding: 2px 4px; border-radius: 3px; pointer-events: none; width: auto; user-select: none;">${labelText}</span>`,
                                className: `shapefile-label`,
                                iconSize: [100, 20],
                                iconAnchor: [50, 0]
                            }),
                            interactive: false
                        });
                    }
                }
            }).addTo(this.map);

            // Apply the proper polygon style based on markers
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
            this.showErrorToast(error.message);
        }
    }
    
    // Helper to create safe HTML content for popups.
    generatePopupContent(properties) {
        let content = '';
        for (const key in properties) {
            if (properties.hasOwnProperty(key)) {
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
                const shouldShow = this.showAllShapes || this.checkPolygonForMarkers(layer);
                // Compute the final color: either use the defined color, generate a random one, or fallback.
                let fillColor = 'blue';
                if (this.shapefileColor) {
                    fillColor = (this.shapefileColor.toLowerCase() === 'random')
                        ? '#' + Math.floor(Math.random()*16777215).toString(16)
                        : this.shapefileColor;
                }
                layer.setStyle({
                    opacity: shouldShow ? 1 : 0,
                    fillOpacity: shouldShow ? 0.5 : 0,
                    fillColor: shouldShow ? fillColor : undefined,
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
