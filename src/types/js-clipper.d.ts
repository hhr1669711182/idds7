// declare module "js-clipper" {
//   namespace ClipperLib {
//     interface IntPoint {
//       X: number;
//       Y: number;
//     }

//     type Path = IntPoint[];
//     class Paths extends Array<Path> {
//       constructor();
//     }

//     enum JoinType {
//       jtSquare = 0,
//       jtRound = 1,
//       jtMiter = 2,
//     }

//     enum EndType {
//       etClosedPolygon = 0,
//       etClosedLine = 1,
//       etOpenButt = 2,
//       etOpenSquare = 3,
//       etOpenRound = 4,
//     }

//     class ClipperOffset {
//       constructor(miterLimit?: number, arcTolerance?: number);
//       AddPath(path: Path, joinType: JoinType, endType: EndType): void;
//       Execute(solution: Paths, delta: number): void;
//       Clear(): void;
//     }
//   }

//   export = ClipperLib;
// }
