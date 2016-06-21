define([
    '../Core/defined',
    '../Core/barycentricCoordinates',
    '../Core/Cartesian3',
    '../Core/Plane',
    '../Core/Ray',
    '../Core/Quaternion',
    '../Core/Matrix3',
    '../Core/IntersectionTests',
    '../Core/Intersections2D',
    '../Core/AttributeCompression',
    '../Scene/SceneMode',
    '../Scene/GlobeSurfaceTile' 
], function (
    defined,
    barycentricCoordinates,
    Cartesian3,
    Plane,
    Ray,
    Quaternion,
    Matrix3,
    IntersectionTests,
    Intersections2D,
    AttributeCompression,
    SceneMode,
    GlobeSurfaceTile
) {
    
    function getPosition(encoding, mode, projection, vertices, index, result) {
        encoding.decodePosition(vertices, index, result);
        
        if (defined(mode) && mode !== SceneMode.SCENE3D) {
            var ellipsoid = projection.ellipsoid;
            var positionCart = ellipsoid.cartesianToCartographic(result);
            projection.project(positionCart, result);
            Cartesian3.fromElements(result.z, result.x, result.y, result);
        }
        
        return result;
    }
    
    var scratchV0 = new Cartesian3();
    var scratchV1 = new Cartesian3();
    var scratchV2 = new Cartesian3();
    var scratchResult = new Cartesian3();

    GlobeSurfaceTile.prototype.pick = function (ray, mode, projection, cullBackFaces, result) {
        var terrain = this.pickTerrain;
        if (!defined(terrain)) {
            return undefined;
        }
        
        if (!defined(result)) {
            result = {};
        }

        var mesh = terrain.mesh;
        if (!defined(mesh)) {
            return undefined;
        }
        
        var vertices = mesh.vertices;
        var indices = mesh.indices;
        var encoding = mesh.encoding;
            
        var length = indices.length;
        for (var i = 0; i < length; i += 3) {
            var i0 = indices[i];
            var i1 = indices[i + 1];
            var i2 = indices[i + 2];
            
            var v0 = getPosition(encoding, mode, projection, vertices, i0, scratchV0);
            var v1 = getPosition(encoding, mode, projection, vertices, i1, scratchV1);
            var v2 = getPosition(encoding, mode, projection, vertices, i2, scratchV2);
            
            var intersection = IntersectionTests.rayTriangle(ray, v0, v1, v2, cullBackFaces, scratchResult);
            if (defined(intersection)) {
                
                var en0 = encoding.getOctEncodedNormal(vertices, i0);
                var en1 = encoding.getOctEncodedNormal(vertices, i1);
                var en2 = encoding.getOctEncodedNormal(vertices, i2);

                var n0 = AttributeCompression.octDecode(en0.x, en0.y, new Cartesian3());
                var n1 = AttributeCompression.octDecode(en1.x, en1.y, new Cartesian3());
                var n2 = AttributeCompression.octDecode(en2.x, en2.y, new Cartesian3());
                
                var barycentric = barycentricCoordinates(intersection, v0, v1, v2);
                
                var multScratch = new Cartesian3();
                result.position = new Cartesian3();
                result.norm = new Cartesian3();
                
                Cartesian3.multiplyByScalar(n0, barycentric.x, multScratch);
                Cartesian3.add(result.norm, multScratch, result.norm);
                Cartesian3.multiplyByScalar(n1, barycentric.y, multScratch);
                Cartesian3.add(result.norm, multScratch, result.norm);
                Cartesian3.multiplyByScalar(n2, barycentric.z, multScratch);
                Cartesian3.add(result.norm, multScratch, result.norm);

                return Cartesian3.clone(intersection, result.position);
            }
        }
        
        return undefined;
    };

    GlobeSurfaceTile.prototype.fillPath = function (rayA, rayB) {
        var terrain = this.pickTerrain;
        if (!defined(terrain)) {
            return undefined;
        }
        
        result =  {};

        var mesh = terrain.mesh;
        if (!defined(mesh)) {
            return undefined;
        }
        
        var planeNormal = Cartesian3.cross(rayA.direction, rayB.direction, new Cartesian3());
        var plane = Plane.fromPointNormal(rayA.origin, planeNormal);
        
        var boundPlaneA = Plane.fromPointNormal(rayA.origin, Cartesian3.cross(rayA.direction, planeNormal, new Cartesian3()));
        var boundPlaneB = Plane.fromPointNormal(rayB.origin, Cartesian3.cross(rayB.direction, planeNormal, new Cartesian3()));
        
        var boundDirectionA = (Cartesian3.dot(boundPlaneA.normal, Ray.getPoint(rayB, 10)) + boundPlaneA.distance) < 0;
        var boundDirectionB = (Cartesian3.dot(boundPlaneB.normal, Ray.getPoint(rayA, 10)) + boundPlaneB.distance) < 0;
        
        var vertices = mesh.vertices;
        var indices = mesh.indices;
        var encoding = mesh.encoding;
            
        var length = vertices.length;
        var orientations = {};
        
        var quaternion = Quaternion.fromAxisAngle(plane.normal, -Math.PI / 2.0);
        var rotation = Matrix3.fromQuaternion(quaternion);
        
        var intersectionMap = new Map();
        
        function calcOrentation(index){
            if (!orientations[index]){
                var pi = encoding.decodePosition(vertices, index, scratchResult);
                orientations[index] = Cartesian3.dot(plane.normal, pi) + plane.distance;
            }
        }
        
        var insectionLookup = {};

        for (var i = 0; i < indices.length; i += 3) {

            var intersections = [];

            var i0 = indices[i];
            var i1 = indices[i + 1];
            var i2 = indices[i + 2];
            
            calcOrentation(i0);
            calcOrentation(i1);
            calcOrentation(i2);

            var p0Behind = orientations[i0] < 0.0;
            var p1Behind = orientations[i1] < 0.0;
            var p2Behind = orientations[i2] < 0.0;
            
            var p0 = encoding.decodePosition(vertices, i0, scratchV0);
            var p1 = encoding.decodePosition(vertices, i1, scratchV1);
            var p2 = encoding.decodePosition(vertices, i2, scratchV2);
                                           
            if (orientations[i0] == 0 || orientations[i1] == 0) {
                if (orientations[i0] == 0 && orientations[i1] == 0){
                    // Handle edge in plane
                } 
            } else if (p0Behind != p1Behind) {
                var u1 = getIntersection(i0, i1);  
                IntersectionTests.lineSegmentPlane(p0, p1, plane, u1);
                intersections.push(u1);
            }
            
            if (orientations[i0] == 0 || orientations[i2] == 0) {
                if (orientations[i0] == 0 && orientations[i2] == 0){
                    // Handle edge in plane
                } 
            } else if (p0Behind != p2Behind) {
                var u2 = getIntersection(i0, i2);  
                IntersectionTests.lineSegmentPlane(p0, p2, plane, u2);
                intersections.push(u2);
            }
            
            if (orientations[i1] == 0 || orientations[i2] == 0) {
                if (orientations[i1] == 0 && orientations[i2] == 0){
                    // Handle edge in plane
                } 
            } else if (p1Behind != p2Behind) {
                var u3 = getIntersection(i1, i2);    
                IntersectionTests.lineSegmentPlane(p1, p2, plane, u3);
                intersections.push(u3);
            }

            intersections = intersections.filter(withinPath);

            if (intersections.length === 2) {
                                
                // (intersectionMap[intersections[0]] = intersectionMap[intersections[0]] || []).push(intersections[1]);
                // (intersectionMap[intersections[1]] = intersectionMap[intersections[1]] || []).push(intersections[0]);
                // nextPoint = intersections[0];

                var Nt = Cartesian3.cross(Cartesian3.subtract(p1, p0, new Cartesian3()), Cartesian3.subtract(p2, p0, new Cartesian3()), new Cartesian3());
                var Ie = Cartesian3.subtract(intersections[1], intersections[0], new Cartesian3());
                Matrix3.multiplyByVector(rotation, Ie, scratchResult);
                
                var direction = Cartesian3.dot(Nt, scratchResult);
                if (direction > 0) {
                    intersectionMap.set(intersections[0], [intersections[0], intersections[1]]);
                } else {
                    intersectionMap.set(intersections[1], [intersections[1], intersections[0]]);
                }                
            }    
                       
        }

        for (var key of intersectionMap.keys()) {
            var cur = intersectionMap.get(key);
            if (cur) {
                while (cur && intersectionMap.has(cur[cur.length - 1])) {
                    var next = cur[cur.length - 1];
                    cur.pop();
                    cur = cur.concat(intersectionMap.get(next));
                    intersectionMap.set(key, cur);
                    intersectionMap.delete(next);
                }
            }
        }

        var polylines = [];

        for (var section of intersectionMap.values()) {
            polylines.push(section);
        }

        return polylines; 
        
        function getIntersection(i0, i1) {
            var key = i0 > i1 ? i1 + "," + i0 : i0 + "," + i1;
            return (insectionLookup[key] = insectionLookup[key] || new Cartesian3());
        }

        function withinPath(point) {
            var aTest = Cartesian3.dot(boundPlaneA.normal, point) + boundPlaneA.distance < 0
            var bTest = Cartesian3.dot(boundPlaneB.normal, point) + boundPlaneB.distance < 0
            return (aTest && boundDirectionA || !aTest && !boundDirectionA) && (bTest && boundDirectionB || !bTest && !boundDirectionB);
        }
    }
    

});