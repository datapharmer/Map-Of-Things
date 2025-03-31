import { LightningElement, api } from 'lwc';

export default class MapOfThingsMarkers extends LightningElement {
    leafletMarkers = {};

    @api iconSizeX;      // from component configuration
    @api iconSizeY;
    @api map;            // Leaflet map instance

    /**
     * Creates a new rotating marker.
     * Instead of using a patched marker, we build a custom marker using L.divIcon and CSS transform.
     */
    createRotatingMarker(newMarker) {
        const { id, lat, lng, icon, popup } = newMarker;
        // Use a divIcon that wraps an img tag; we set the image’s style to include a rotation
        const html = `<img src="${icon}" 
                          style="width:${this.iconSizeX}px; height:${this.iconSizeY}px; 
                                 transform:rotate(0deg); 
                                 transition: transform 0.5s;"
                          alt="marker icon"/>`;
        const customIcon = L.divIcon({
            html,
            className: '', // remove any default marker class if needed
            iconSize: [this.iconSizeX, this.iconSizeY],
            iconAnchor: [this.iconSizeX/2, this.iconSizeY/2],
            popupAnchor: [0, -(this.iconSizeY * 0.25)]
        });
        // Create the marker using custom icon.
        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.addTo(this.map).bindPopup(popup);
        // Store the marker with its current angle (=0)
        this.leafletMarkers[id] = { marker, angle: 0 };
    }

    /**
     * When marker location must change and/or rotation should animate,
     * update the marker position and adjust the rotation by updating the inline style.
     */
    updateRotatingMarker(newMarker) {
        const { id, lat, lng, icon, popup } = newMarker;
        const targetData = this.leafletMarkers[id];
        if (!targetData) {
            // Marker does not exist yet, so create one.
            this.createRotatingMarker(newMarker);
            return;
        }
        const { marker, angle: currentAngle } = targetData;
        // Update position (if moved a significant amount)
        marker.setLatLng([lat, lng]);
        // Compute the new required angle based on your application logic.
        // For example, calculate an angle (in degrees) from current position to new position.
        // (The actual calculation may be more complex; in our sample we simply add 30deg)
        const newAngle = (currentAngle + 30) % 360;
        // Retrieve the marker’s DOM element (the img tag inside the divIcon)
        // Note: marker.getElement() returns the outer container; query the <img>.
        const markerEl = marker.getElement()?.querySelector('img');
        if (markerEl) {
            markerEl.style.transform = `rotate(${newAngle}deg)`;
        }
        // If the popup has changed, update it.
        if (popup && marker.getPopup().getContent() !== popup) {
            marker.setPopupContent(popup);
        }
        // Save the new angle
        this.leafletMarkers[id].angle = newAngle;
    }

    /**
     * Setter for markers array.
     * newMarkers is assumed to be an array of marker objects.
     */
    @api
    set markers(newMarkers) {
        // Loop though newMarkers and update or create markers accordingly.
        newMarkers.forEach(newMarker => {
            if (this.leafletMarkers[newMarker.id]) {
                this.updateRotatingMarker(newMarker);
            } else {
                this.createRotatingMarker(newMarker);
            }
        });
        // Remove markers that are not in newMarkers.
        Object.keys(this.leafletMarkers).forEach(existingId => {
            if (!newMarkers.find(m => m.id === existingId)) {
                this.map.removeLayer(this.leafletMarkers[existingId].marker);
                delete this.leafletMarkers[existingId];
            }
        });
    }
}
