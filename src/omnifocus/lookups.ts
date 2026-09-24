/**
 * Shared OmniJS name-resolution helpers as string templates, embedded in scripts like the serializers.
 * Both resolve before the caller mutates anything, so a bad name never leaves a half-created task behind.
 */

/**
 * findProjectByName(name): the single project with that exact name. When several share it, prefers the
 * one that is active or on hold (and not in a dropped folder); throws if that is still ambiguous.
 * Requires effectiveStatusFn (for projectIsEffectivelyDropped) in the same script.
 */
export const findProjectByNameFn = `
function findProjectByName(name) {
  var matches = flattenedProjects.filter(function(p) { return p.name === name; });
  if (matches.length === 0) throw new Error("Project not found: " + name);
  if (matches.length === 1) return matches[0];

  var open = matches.filter(function(p) {
    return (p.status === Project.Status.Active || p.status === Project.Status.OnHold) && !projectIsEffectivelyDropped(p);
  });
  if (open.length === 1) return open[0];

  var statusNames = {};
  statusNames[Project.Status.Active] = "active";
  statusNames[Project.Status.OnHold] = "on hold";
  statusNames[Project.Status.Done] = "done";
  statusNames[Project.Status.Dropped] = "dropped";
  var candidates = (open.length > 1 ? open : matches).map(function(p) {
    return p.id.primaryKey + " (" + (projectIsEffectivelyDropped(p) ? "dropped" : statusNames[p.status]) + ")";
  });
  throw new Error(
    "Multiple projects are named \\"" + name + "\\"" + (open.length > 1 ? " and still open" : "") +
    ". Use projectId instead: " + candidates.join(", ")
  );
}`;

/**
 * resolveTags(names, createMissing): map of tag name -> Tag for every name. Unknown names throw, listing
 * any existing tag that differs only by case or punctuation, unless createMissing is true.
 */
export const resolveTagsFn = `
function resolveTags(names, createMissing) {
  var byName = {};
  flattenedTags.forEach(function(t) { if (!byName[t.name]) byName[t.name] = t; });

  var missing = [];
  names.forEach(function(name) {
    if (!byName[name] && missing.indexOf(name) === -1) missing.push(name);
  });

  if (missing.length > 0 && !createMissing) {
    var key = function(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); };
    var described = missing.map(function(name) {
      var similar = flattenedTags
        .filter(function(t) { return key(t.name) === key(name); })
        .map(function(t) { return "\\"" + t.name + "\\""; });
      return "\\"" + name + "\\"" + (similar.length > 0 ? " (did you mean " + similar.join(" or ") + "?)" : "");
    });
    throw new Error(
      "Unknown tag" + (missing.length > 1 ? "s" : "") + ": " + described.join(", ") +
      ". Use an existing tag name exactly, create it first with create_tag, or pass createMissingTags: true."
    );
  }

  missing.forEach(function(name) {
    var newTag = new Tag(name);
    tags.push(newTag);
    byName[name] = newTag;
  });
  return byName;
}`;
