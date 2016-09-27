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

Globe.prototype.diverganceOverlay = function() {
    var tilesToRender = this._surface._tilesToRender;
    var divergencies = [];

    for (i = 0; i < tilesToRender.length; ++i) {
        tile = tilesToRender[i];
        var tileData = tile.data;
        var mesh = tileData.pickTerrain.mesh;
        var al = buildAdjacencies(mesh.indices);

        for (var index of al.keys()) {
            var div = 0;
            var num = 0;
            var startPos = tileData.getPosition(index);
            var startNorm = tileData.getNormal(index);
            for (var adj of al.get(index)) {
                var adjPos = tileData.getPosition(adj);
                var adjNorm = tileData.getNormal(adj);

                var dp = Cartesian3.subtract(adjPos, startPos, new Cartesian3());
                var dn = Cartesian3.subtract(adjNorm, startNorm, new Cartesian3());

                var div = dn.x / dp.x + dn.y / dp.y + dn.z / dp.z;
                if (div) {
                    divergencies.push({start: startPos, end: adjPos, divergance: div});
                }
            }
        }
    }

    return divergencies;

    function buildAdjacencies(indecies){  
        var al = new Map();
        
        for (var i = 0; i <  indecies.length; i++) {
            var cur = indecies[i];
            if (!al.get(cur)) {
                al.set(cur, new Set());
            }
            switch (i % 3) {
                case 0:
                    al.get(cur).add(indecies[i+1]);
                    al.get(cur).add(indecies[i+2]);
                    break;
                case 1:
                    al.get(cur).add(indecies[i-1]);
                    al.get(cur).add(indecies[i+1]);
                    break;
                case 2:
                    al.get(cur).add(indecies[i-2]);
                    al.get(cur).add(indecies[i-1]);
                    break;
            }
        }
        
        return al;
    }
}

Globe.prototype.fillPath = function(origin, start, end, scene, result) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(origin)) {
            throw new DeveloperError('origin is required');
        }
        if (!defined(start)) {
            throw new DeveloperError('start is required');
        }
        if (!defined(end)) {
            throw new DeveloperError('end is required');
        }
        if (!defined(scene)) {
            throw new DeveloperError('scene is required');
        }
        //>>includeEnd('debug');

        var rayA = new Cesium.Ray(origin, Cesium.Cartesian3.subtract(end.position, origin, new Cesium.Cartesian3()));
        var rayB = new Cesium.Ray(origin, Cesium.Cartesian3.subtract(start.position, origin, new Cesium.Cartesian3()));

        var planeNormal = Cartesian3.cross(rayB.direction, rayA.direction, new Cartesian3());
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
            var tile = sphereIntersections[i].fillPath(rayA, rayB, scene.mode, scene.mapProjection, true, result);
            tile.forEach(function(section){
                if (section.length > 0) {
                    intersection.push(section);
                }
            });
        }

        var curSection = intersection.pop();
        while (intersection.length > 0) {
            var nom;
            var nomDist;
            var before;
            for (var ci = 0; ci < intersection.length; ci++) {
                var canDist = Cartesian3.distanceSquared(curSection[curSection.length - 1].position, intersection[ci][0].position);
                if (canDist < nomDist || nomDist === undefined) {
                    nomDist = canDist;
                    nom = ci;
                    before = false;
                }
                canDist = Cartesian3.distanceSquared(curSection[0].position, intersection[ci][intersection[ci].length - 1].position);
                if (canDist < nomDist || nomDist === undefined) {
                    nomDist = canDist;
                    nom = ci;
                    before = true;
                }
            }
            if (before) {
                curSection = intersection[nom].concat(curSection); 
            } else {
                curSection = curSection.concat(intersection[nom]);
            }
            intersection.splice(nom, 1);
        }

        curSection.unshift(start);
        curSection.push(end)

        return [[curSection]];
    };


});