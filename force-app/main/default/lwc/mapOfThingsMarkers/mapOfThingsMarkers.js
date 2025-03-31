import { LightningElement, api } from 'lwc';

const EVENT_ZOOM_END = 'zoomend';
const ROTATION_LEFT = 'left';
const ROTATION_RIGHT = 'right';

export default class MapOfThingsMarkers extends LightningElement {
    leafletMarker = {};
    isMoving = false;
    initedLayerControl = false;
    layerControl;
    layerGroup = {};

    @api iconSizeX;
    @api iconSizeY;
    @api useCustomMarker;
    @api useGrouping;
    @api markerZoomWithMap;
    @api markerRotate;
    @api moveDuration;
    @api map;
    
    @api
    get markers(){
        return this.leafletMarker;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0){
            const allMarker = {};
            newMarkers.forEach(newMarker => {
                allMarker[newMarker.id] = {
                    old: false,
                    new: true,
                    marker: newMarker
                };
            });
            Object.keys(this.leafletMarker).forEach(currentMarkerId => {
                if (allMarker.hasOwnProperty(currentMarkerId)) {
                    allMarker[currentMarkerId].old = true;
                } else {
                    allMarker[currentMarkerId] = {
                        old: true,
                        new: false
                    };
                }
            });
            Object.keys(allMarker).forEach(markerId => {
                const target = allMarker[markerId];
                const targetMarker = target.marker;
                if (!target.old && target.new) {
                    this.createMarker(targetMarker);
                } else if (target.old && target.new) {
                    this.changeMarker(targetMarker);
                } else if (target.old && !target.new) {
                    this.removeMarker(markerId);
                }
            });
            if (this.markerZoomWithMap && this.useCustomMarker && !this.doneListenMapZoom){
                this.listenMapZoom();
            }
        }
    }
    
    createMarker(newMarker) {
        const { id, lat, lng, icon, group } = newMarker;
        const imgurl = icon;
        const angle = 0;
        
        // Create popup content safely
        const popupContent = document.createElement('div');
        popupContent.textContent = newMarker.popup;
        
        const popup = L.popup().setContent(popupContent);
        
        // Create marker with LWS-safe event handling
        const marker = this.useCustomMarker ? 
            L.marker([lat, lng], {
                icon: this.getMarkerIcon(imgurl),
                iconAngle: 0
            }) : 
            L.marker([lat, lng]);
            
        // Add marker to map with safe event binding
        marker.addTo(this.map).bindPopup(popup);
        
        // Use LWS-compliant method for click events
        marker.off('click'); // Remove any existing click handlers
        marker.on('click', this.handleMarkerClick.bind(this));
        
        this.leafletMarker[id] = { lat, lng, popup: newMarker.popup, angle, imgurl, marker, group };
        this.initLayerGroup(newMarker);
    }
    
    // Safe marker click handler
    handleMarkerClick(e) {
        try {
            // Use LWS-compliant method to open popup
            if (e.target && typeof e.target.openPopup === 'function') {
                e.target.openPopup();
            }
        } catch (error) {
            console.error('Error handling marker click:', error);
        }
    }

    // Rest of the existing methods remain unchanged...
    listenMapZoom(){
        this.map.on(EVENT_ZOOM_END, () => {
            this.zoomMarker();
        });
        this.doneListenMapZoom = true;
    }
    
    initLayerControl(){
        this.layerControl = L.control.layers(null, {}, {
            collapsed: false, sortLayers: true
        }).addTo(this.map);
        this.initedLayerControl = true;
    }    
    
    // ... (keep all other existing methods exactly the same)
}
