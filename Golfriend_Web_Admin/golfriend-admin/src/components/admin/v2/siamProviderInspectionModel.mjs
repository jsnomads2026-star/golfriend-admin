const text=(value)=>typeof value==='string'?value:'';
const number=(value)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const textList=(value)=>Array.isArray(value)?value.filter((item)=>typeof item==='string'):[];
const unresolvedShells=(value)=>Array.isArray(value)?value.map((item)=>{const row=item&&typeof item==='object'?item:{};return {clubID:text(row.clubID),clubName:text(row.clubName)};}).filter((item)=>item.clubID||item.clubName):[];

export function normalizeSiamInspection(value){
  const source=value&&typeof value==='object'?value:{};
  const rawClubs=Array.isArray(source.clubs)?source.clubs:[];
  const clubs=rawClubs.map((club)=>{
    const row=club&&typeof club==='object'?club:{};
    const rawCourses=Array.isArray(row.courses)?row.courses:[];
    return {clubID:text(row.clubID),clubName:text(row.clubName),listHadEmbeddedCourses:row.listHadEmbeddedCourses===true,detailAddedCourseIDs:textList(row.detailAddedCourseIDs),latitude:number(row.latitude),longitude:number(row.longitude),courses:rawCourses.map((course)=>{const item=course&&typeof course==='object'?course:{};return {courseID:text(item.courseID),courseName:text(item.courseName),latitude:number(item.latitude),longitude:number(item.longitude)};}).filter((course)=>course.courseID||course.courseName)};
  }).filter((club)=>club.clubID||club.clubName);
  const summary=source.summary&&typeof source.summary==='object'?source.summary:{};
  return {clubs,summary:{providerCallsUsed:number(summary.providerCallsUsed),unresolvedShells:unresolvedShells(summary.unresolvedShells)}};
}
