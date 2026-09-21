'use strict';

// Provider detail is allowed to become scoring authority only when it contains
// a complete, internally consistent 18-hole card.  This is deliberately a
// projection, not a repair: absent or malformed provider facts stay absent.
function integer(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function projectHoles(value) {
  if (!Array.isArray(value) || value.length !== 18) return null;
  const seenHoles = new Set(), seenStrokeIndexes = new Set(), holes = [];
  for (const source of value) {
    const holeNumber = integer(source?.holeNumber, 1, 18);
    const par = integer(source?.par, 3, 5);
    const strokeIndex = integer(source?.strokeIndex, 1, 18);
    if (holeNumber === null || par === null || strokeIndex === null || seenHoles.has(holeNumber) || seenStrokeIndexes.has(strokeIndex)) return null;
    seenHoles.add(holeNumber);
    seenStrokeIndexes.add(strokeIndex);
    holes.push(Object.freeze({ holeNumber, par, strokeIndex }));
  }
  return seenHoles.size === 18 && seenStrokeIndexes.size === 18 ? Object.freeze(holes.sort((a, b) => a.holeNumber - b.holeNumber)) : null;
}

function project(course) {
  const holes = projectHoles(course?.holes);
  if (!holes) return null;
  // Tee and rating payloads are retained exactly as provider facts when
  // supplied.  They are not synthesized and are not yet score authority.
  return Object.freeze({
    holes,
    tees: Array.isArray(course?.tees) ? course.tees : null,
    ratings: course?.ratings && typeof course.ratings === 'object' && !Array.isArray(course.ratings) ? course.ratings : null,
  });
}

module.exports = Object.freeze({ project, projectHoles });
