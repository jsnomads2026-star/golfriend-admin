export type ClubhouseDestination={id:string;clubhouseId:string;providerClubId:string;displayName:string;address:string;city:string;state:string;country:string;latitude:number|null;longitude:number|null;distanceKm:number|null;withinRequestedRadius:boolean|null;layoutIds:string[]};
export function haversineKm(origin:{latitude:number;longitude:number}|null,latitude:number|null,longitude:number|null):number|null;
export function normalizeClubhouseDestinations(clubhouseRows:unknown[],courseRows:unknown[],origin?:{latitude:number;longitude:number}|null,radiusKm?:number|null):ClubhouseDestination[];
