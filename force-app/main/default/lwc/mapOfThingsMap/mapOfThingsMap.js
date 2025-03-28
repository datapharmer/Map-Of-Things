import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

// Recommended: Render this component in light DOM to work around LW Security restrictions.
export default class MapOfThingsMap extends LightningElement {
    // Render our component in light DOM instead of Shadow DOM.
    static renderMode = 'light';

    map;
    _markers = [];

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;

    // External marker objects (each with at least "lat" and "lng") are provided for filtering the shapefile.
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
        // The map container is in the light DOM now.
        this.template.querySelector('.inner-map-container').style.height = this.mapSizeY;
    }

    async connectedCallback() {
        try {
            // Load external CSS and JS sequentially so that libraries load in order.
            await loadStyle(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/leaflet.css');
            await loadScript(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/leaflet.js');
            await loadScript(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/leafletjs_marker_rotate_addon.js');
            await loadScript(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/catiline.js');
            await loadScript(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/shp.js');
            await loadScript(this, this.tileServerUrl.replace(/(.*)\/.*/, '$1') + '/leaflet.shpfile.js');

            if (!window.L) {
                throw new Error('Leaflet did not attach to window');
            }
            this.drawMap();
        } catch (error) {
            console.error('Error loading external libraries:', error);
        }
    }

    async drawMap() {
        const container = this.template.querySelector('.inner-map-container');
        // Initialize the map using window.L.
        this.map = window.L.map(container, {
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Create a pane for labels that sits above normal markers.
        this.map.createPane('labelsPane');
        const labelsPane = this.map.getPane('labelsPane');
        labelsPane.style.zIndex = 650;
        labelsPane.style.pointerEvents = 'none';

        window.L.tileLayer(this.tileServerUrl, {
            minZoom: 2,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create a layer for labels (on the custom pane).
        this.labelLayer = window.L.layerGroup([], { pane: 'labelsPane' }).addTo(this.map);

        await this.renderShapefile();

        this.dispatchEvent(new CustomEvent('init', { detail: this.map }));
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
                        // Instead of using Leaflet's built-in popup (which triggers DOM access errors),
                        // we use our own click handler. When a marker is clicked, we open a popup
                        // with autoPan disabled.
                        layer.on('click', () => {
                            try {
                                // Use plain text (or safe HTML) for popup content.
                                const content = this.generatePopupContent(feature.properties);
                                layer.bindPopup(content, {
                                    maxHeight: 200,
                                    autoPan: false,
                                    closeOnClick: true
                                }).openPopup();
                            } catch (popupError) {
                                console.error('Popup error:', popupError);
                            }
                        });

                        // Compute a suitable label position, starting from the polygon's center.
                        const boundsCenter = layer.getBounds().getCenter();
                        let labelLatLng = boundsCenter;

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

            if (this._markers && this._markers.length > 0) {
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
     * Uses the standard ray-casting algorithm.
     * Returns true if the point lies inside the polygon.
     */
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
            const intersect = ((yi > y) !== (yj > y)) &&
                              (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Loop over each polygon in the GeoJSON layer.
     * Update the polygon’s style and add or remove its label based on whether it contains a marker.
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
     * Returns true if the polygon contains at least one marker from the _markers array.
     */
    checkPolygonForMarkers(polygonLayer) {
        if (!this._markers || this._markers.length === 0) {
            return false;
        }
        let hasMarkerInside = false;
        this._markers.forEach(markerData => {
            const markerLatLng = window.L.latLng(markerData.lat, markerData.lng);
            if (polygonLayer.getBounds().contains(markerLatLng) &&
                this.pointInPolygon(markerLatLng, polygonLayer)) {
                hasMarkerInside = true;
            }
        });
        return hasMarkerInside;
    }
}
