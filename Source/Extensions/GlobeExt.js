define([
        '../Core/BoundingSphere',
        '../Core/buildModuleUrl',
        '../Core/Cartesian3',
        '../Core/Plane',
        '../Core/Cartographic',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/EllipsoidTerrainProvider',
        '../Core/GeographicProjection',
        '../Core/IntersectionTests',
        '../Core/loadImage',
        '../Core/Ray',
        '../Core/Rectangle',
        '../Renderer/ShaderSource',
        '../Renderer/Texture',
        '../Shaders/GlobeFS',
        '../Shaders/GlobeVS',
        '../Shaders/GroundAtmosphere',
        '../ThirdParty/when',
        '../Scene/GlobeSurfaceShaderSet',
        '../Scene/GlobeSurfaceTileProvider',
        '../Scene/ImageryLayerCollection',
        '../Scene/QuadtreePrimitive',
        '../Scene/SceneMode',
        '../Scene/Globe'
    ], function(
        BoundingSphere,
        buildModuleUrl,
        Cartesian3,
        Plane,
        Cartographic,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        Ellipsoid,
        EllipsoidTerrainProvider,
        GeographicProjection,
        IntersectionTests,
        loadImage,
        Ray,
        Rectangle,
        ShaderSource,
        Texture,
        GlobeFS,
        GlobeVS,
        GroundAtmosphere,
        when,
        GlobeSurfaceShaderSet,
        GlobeSurfaceTileProvider,
        ImageryLayerCollection,
        QuadtreePrimitive,
        SceneMode,
        Globe) {
            
function createComparePickTileFunction(rayOrigin) {
        return function(a, b) {
            var aDist = BoundingSphere.distanceSquaredTo(a.pickBoundingSphere, rayOrigin);
            var bDist = BoundingSphere.distanceSquaredTo(b.pickBoundingSphere, rayOrigin);

            return aDist - bDist;
        };
    }
            
var scratchArray = [];
var scratchSphereIntersectionResult = {
    start : 0.0,
    stop : 0.0
};
    
Globe.prototype.fillPath = function(rayA, rayB, scene, result) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(rayA)) {
            throw new DeveloperError('rayA is required');
        }
        if (!defined(rayB)) {
            throw new DeveloperError('rayB is required');
        }
        if (!defined(scene)) {
            throw new DeveloperError('scene is required');
        }
        //>>includeEnd('debug');

        var planeNormal = Cartesian3.cross(rayA.direction, rayB.direction, new Cartesian3());
        var plane = Plane.fromPointNormal(rayA.origin, planeNormal);

        var rayANormal = Cartesian3.cross(rayA.direction, planeNormal, new Cartesian3());
        var rayBNormal = Cartesian3.cross(rayB.direction, planeNormal, new Cartesian3());

        var mode = scene.mode;
        var projection = scene.mapProjection;

        var sphereIntersections = scratchArray;
        sphereIntersections.length = 0;

        var tilesToRender = this._surface._tilesToRender;
        var length = tilesToRender.length;

        var tile;
        var i;

        for (i = 0; i < length; ++i) {
            tile = tilesToRender[i];
            var tileData = tile.data;

            if (!defined(tileData)) {
                continue;
            }

            var boundingVolume = tileData.pickBoundingSphere;
            if (mode !== SceneMode.SCENE3D) {
                BoundingSphere.fromRectangleWithHeights2D(tile.rectangle, projection, tileData.minimumHeight, tileData.maximumHeight, boundingVolume);
                Cartesian3.fromElements(boundingVolume.center.z, boundingVolume.center.x, boundingVolume.center.y, boundingVolume.center);
            } else {
                BoundingSphere.clone(tileData.boundingSphere3D, boundingVolume);
            }

            var boundingSphereIntersects = IntersectionTests.planeSphere(plane, boundingVolume, scratchSphereIntersectionResult);
            if (boundingSphereIntersects) {
                var rayADist = Plane.getPointDistance(Plane.fromPointNormal(rayA.origin, rayANormal), boundingVolume.center) - boundingVolume.radius;
                var rayBDist = Plane.getPointDistance(Plane.fromPointNormal(rayB.origin, rayBNormal), boundingVolume.center) + boundingVolume.radius;
                if (rayADist < 0 && rayBDist > 0) {
                    sphereIntersections.push(tileData);
                }
            }
        }

        sphereIntersections.sort(createComparePickTileFunction(scene.camera.position));

        var intersection = [];
        length = sphereIntersections.length;
        for (i = 0; i < length; ++i) {
            var section = sphereIntersections[i].fillPath(rayA, rayB, scene.mode, scene.mapProjection, true, result);
            intersection = intersection.concat(section);

            // if (intersection.length == 0) {
            //     intersection = section;
            // } else {
            //     if (intersection[intersection.length - 1].equals(section[0])){
            //         intersection.pop();
                    
            //     } else if (intersection[intersection.length - 1].equals(section[section.length - 1])){
            //         intersection.pop();
            //         section.reverse();
            //         intersection = intersection.concat(section);
            //     } else if (intersection[0].equals(section[section.length - 1])){
            //         section.pop();
            //         intersection = section.concat(intersection);
            //     } else if (intersection[0].equals(section[0])){
            //         intersection.reverse();
            //         intersection.pop();
            //         intersection = intersection.concat(section);
            //     }
            // }
        }

        return intersection;
    };
});