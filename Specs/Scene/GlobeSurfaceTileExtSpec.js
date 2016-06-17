/*global defineSuite*/
defineSuite([
        'Scene/GlobeSurfaceTile',
        'Extensions/GlobeSurfaceTileExt',
        'Core/Cartesian3',
        'Core/Cartesian4',
        'Core/CesiumTerrainProvider',
        'Core/defined',
        'Core/Ellipsoid',
        'Core/GeographicTilingScheme',
        'Core/Ray',
        'Core/Rectangle',
        'Core/WebMercatorTilingScheme',
        'Scene/Imagery',
        'Scene/ImageryLayer',
        'Scene/ImageryLayerCollection',
        'Scene/ImageryState',
        'Scene/QuadtreeTile',
        'Scene/QuadtreeTileLoadState',
        'Scene/TerrainState',
        'Scene/TileImagery',
        'Specs/createScene',
        'Specs/pollToPromise',
        'ThirdParty/when'
    ], function(
        GlobeSurfaceTile,
        GlobeSurfaceTileExt,
        Cartesian3,
        Cartesian4,
        CesiumTerrainProvider,
        defined,
        Ellipsoid,
        GeographicTilingScheme,
        Ray,
        Rectangle,
        WebMercatorTilingScheme,
        Imagery,
        ImageryLayer,
        ImageryLayerCollection,
        ImageryState,
        QuadtreeTile,
        QuadtreeTileLoadState,
        TerrainState,
        TileImagery,
        createScene,
        pollToPromise,
        when) {
    'use strict';

    describe('fillPath', function() {
        var scene;

        beforeAll(function() {
            scene = createScene();
        });

        afterAll(function() {
            scene.destroyForSpecs();
        });

        it('works', function() {
            var terrainProvider = new CesiumTerrainProvider({
                url : 'https://assets.agi.com/stk-terrain/world',
                requestVertexNormals : true
            });

            var tile = new QuadtreeTile({
                tilingScheme : new GeographicTilingScheme(),
                level : 11,
                x : 3788,
                y : 1336
            });

            var imageryLayerCollection = new ImageryLayerCollection();

            return pollToPromise(function() {
                if (!terrainProvider.ready) {
                    return false;
                }

                GlobeSurfaceTile.processStateMachine(tile, scene.frameState, terrainProvider, imageryLayerCollection, []);
                return tile.state === QuadtreeTileLoadState.DONE;
            }).then(function() {
                var rayA = new Ray(
                    new Cartesian3(-5052039.459789615, 2561172.040315167, -2936276.999965875),
                    new Cartesian3(0.5036332963145244, 0.6648033332898124, 0.5517155343926082));
                var rayB = new Ray(
                    new Cartesian3(-5052039.459789615, 2561172.040315167, -2936276.999965875),
                    new Cartesian3(0.5036332963145244, 0.6648033332898124, 0.6517155343926082));
                var path = tile.data.fillPath(rayA, rayB);
                expect(path.length).toBeGreaterThan(0);
            });
        });
    }, 'WebGL');
});
