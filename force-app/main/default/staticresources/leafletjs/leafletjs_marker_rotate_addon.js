/*
 * Firefox-compatible Leaflet Marker Rotation Addon for LWC
 * Handles PointerEvents and LWS constraints
 */
(function() {
    function initRotateAddon(L) {
        if (!L || !L.Marker) return;

        var _oldSetPos = L.Marker.prototype._setPos;
        var _oldUpdate = L.Marker.prototype.update;

        L.Marker.include({
            _updateTransform: function() {
                if (!this._icon || !this.options.iconAngle) return;

                var icon = this.options.icon || new L.Icon.Default();
                var anchor = icon.options.iconAnchor || [12, 41];
                var size = icon.options.iconSize || [25, 41];
                var center = L.point(size).divideBy(2)._subtract(L.point(anchor));

                var transform = [
                    'translate(' + -center.x + 'px, ' + -center.y + 'px)',
                    'rotate(' + this.options.iconAngle + 'deg)',
                    'translate(' + center.x + 'px, ' + center.y + 'px)'
                ].join(' ');

                L.DomUtil.setStyle(this._icon, 'transform', transform);
                L.DomUtil.setStyle(this._icon, '-webkit-transform', transform);
                L.DomUtil.setStyle(this._icon, '-ms-transform', transform);
            },

            setIconAngle: function(angle) {
                this.options.iconAngle = angle;
                if (this._map) {
                    this._updateTransform();
                }
                return this;
            },

            _setPos: function(pos) {
                _oldSetPos.call(this, pos);
                this._updateTransform();
            },

            update: function() {
                _oldUpdate.call(this);
                this._updateTransform();
                return this;
            }
        });
    }

    // Handle different loading scenarios
    if (typeof L !== 'undefined') {
        initRotateAddon(L);
    } else {
        var checkL = setInterval(function() {
            if (typeof L !== 'undefined') {
                clearInterval(checkL);
                initRotateAddon(L);
            }
        }, 100);
    }
})();
