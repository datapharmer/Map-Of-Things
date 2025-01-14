    drawMap(){
	    				console.log("start drawing map");
        const container = this.template.querySelector(MAP_CONTAINER);
        this.map = L.map(container, { 
            zoomControl: true, tap:false   
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);    
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);
	    				console.log("start loading shapefile with school districts: " + this.schooldistrictsUrl);
	    //todo: check into rangeparent issue in firefox related to Component.index():'Invalid redundant use of component.index().

		        var shpfile = new L.Shapefile(this.schooldistrictsUrl, {
			onEachFeature: function(feature, layer) {
				if (feature.properties) {
					layer.bindPopup(Object.keys(feature.properties).map(function(k) {
						return k + ": " + feature.properties[k];
					}).join("<br />"), {
						maxHeight: 200
					});
				}
			}
		});

		shpfile.addTo(this.map);
	    		console.log("shapefile data added to map");
			shpfile.once("data:loaded", function() {
				console.log("finished loaded shapefile");
			});
			this.dispatchEvent(new CustomEvent(
				CUSTOM_EVENT_INIT, {detail: this.map}
			));
    }
