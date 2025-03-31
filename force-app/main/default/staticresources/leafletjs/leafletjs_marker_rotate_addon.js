/*
 * Revised Marker Rotate Add-on – CSS-Only Rotation
 *
 * This version avoids computing offset translations so that it does not trigger
 * Lightning Web Security errors (such as “Cannot access rangeParent”) in Firefox.
 * It simply sets the transform origin to the center (50% 50%) and rotates the icon.
 *
 * Note: This solution assumes that your custom marker icons have their anchor
 * point centered (or that a small visual displacement is acceptable).
 */
(function () {
    // Only proceed if Leaflet (L) is defined.
    if (!window.L) {
        return;
    }
    
    // Cache the original _setPos method.
    var originalSetPos = L.Marker.prototype._setPos;
    
    L.Marker.include({
        // Overridden _setPos that applies a simple rotation transform.
        _setPos: function (pos) {
            // Remove any previously set transform so that we start fresh.
            if (this._icon) {
                this._icon.style.removeProperty('transform');
            }
            if (this._shadow) {
                this._shadow.style.removeProperty('transform');
            }
            
            // Call the original _setPos.
            originalSetPos.call(this, pos);
            
            // If an icon angle is specified, apply a CSS transform that rotates
            // the marker about its center.
            if (this.options.iconAngle && this._icon) {
                try {
                    this._icon.style.setProperty('transform-origin', '50% 50%');
                    this._icon.style.setProperty('transform', 'rotate(' + this.options.iconAngle + 'deg)');
                } catch (e) {
                    // In case of errors, log them (for debugging) but do not break execution.
                    console.error('Error setting icon rotation:', e);
                }
            }
            
            // Do the same for the shadow, if one exists and shadow size is defined.
            if (this.options.iconAngle && this._shadow && this.options.icon && this.options.icon.options.shadowSize) {
                try {
                    this._shadow.style.setProperty('transform-origin', '50% 50%');
                    this._shadow.style.setProperty('transform', 'rotate(' + this.options.iconAngle + 'deg)');
                } catch (e) {
                    console.error('Error setting shadow rotation:', e);
                }
            }
        },
        
        // Public method to update the rotation angle.
        setIconAngle: function (angle) {
            this.options.iconAngle = angle;
            if (this._map) {
                this.update();
            }
        }
    });
}());
