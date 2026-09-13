export type NearbyClubHouseRow={clubHouseId:string;clubHouseName:string;distanceKm:number;area:string};
export function haversineKm(origin:{latitude:number;longitude:number}|null,latitude:number|null,longitude:number|null):number|null;
export function nearbyClubHouses(clubhouseRows:unknown[],origin:{latitude:number;longitude:number}|null,radiusKm:number):NearbyClubHouseRow[];
