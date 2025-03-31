(function () {
    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        console.error('Leaflet must be loaded before the marker rotate addon');
        return;
    }
    
    // Store the original _setPos method
    var _old__setPos = L.Marker.prototype._setPos;
    
    L.Marker.include({
        _updateImg: function(i, a, s) {
            try {
                // Use a safer approach to modify transforms
                if (!i || !i.style) return;
                
                a = L.point(s).divideBy(2)._subtract(L.point(a));
                var transform = '';
                transform += ' translate(' + -a.x + 'px, ' + -a.y + 'px)';
                transform += ' rotate(' + (this.options.iconAngle || 0) + 'deg)';
                transform += ' translate(' + a.x + 'px, ' + a.y + 'px)';
                
                // Use a safer way to apply transforms
                var currentTransform = i.style[L.DomUtil.TRANSFORM] || '';
                i.style[L.DomUtil.TRANSFORM] = currentTransform + transform;
            } catch (e) {
                console.warn('Error updating marker rotation:', e);
            }
        },

        setIconAngle: function (iconAngle) {
            this.options.iconAngle = iconAngle;
            if (this._map) {
                this.update();
            }
            return this;
        },

        _setPos: function (pos) {
            try {
                // Reset transforms safely
                if (this._icon && this._icon.style) {
                    this._icon.style[L.DomUtil.TRANSFORM] = '';
                }
                if (this._shadow && this._shadow.style) {
                    this._shadow.style[L.DomUtil.TRANSFORM] = '';
                }

                // Call original method
                _old__setPos.apply(this, [pos]);

                // Apply rotation if needed
                if (this.options.iconAngle) {
                    var defaultIcon = new L.Icon.Default();
                    var a = this.options.icon && this.options.icon.options.iconAnchor || 
                            defaultIcon.options.iconAnchor;
                    var s = this.options.icon && this.options.icon.options.iconSize || 
                            defaultIcon.options.iconSize;
                    
                    if (this._icon) {
                        this._updateImg(this._icon, a, s);
                    }
                    
                    if (this._shadow && this.options.icon.options.shadowAnchor && this.options.icon.options.shadowSize) {
                        var shadowAnchor = this.options.icon.options.shadowAnchor;
                        var shadowSize = this.options.icon.options.shadowSize;
                        this._updateImg(this._shadow, shadowAnchor, shadowSize);
                    }
                }
            } catch (e) {
                console.warn('Error setting marker position:', e);
            }
        }
    });
})();
