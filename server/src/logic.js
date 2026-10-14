export const SUGGESTED_TAGS = [
  'slow mornings', 'books', 'quiet walks', 'music', 'art', 'gaming',
  'deep talks', 'coffee', 'nature', 'movies', 'journaling', 'pets',
  'cooking', 'photography', 'stargazing', 'learning', 'plants', 'poetry',
]

export function normalizeTags(input) {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map(tag => String(tag).toLowerCase().replace(/^#/, '').trim().replace(/\s+/g, ' '))
    .filter(tag => tag.length >= 2 && tag.length <= 30 && /^[\p{L}\p{N}][\p{L}\p{N} &'’-]*$/u.test(tag)))].slice(0, 8)
}

export function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':')
}

export function recommend(viewerId, users, acceptedConnections, allConnections, blockedIds = []) {
  const me = users.find(user => String(user._id) === String(viewerId))
  if (!me) return []
  const blocked = new Set(blockedIds.map(String))
  const existing = new Set([String(viewerId)])
  for (const edge of allConnections) {
    if (String(edge.requester) === String(viewerId)) existing.add(String(edge.recipient))
    if (String(edge.recipient) === String(viewerId)) existing.add(String(edge.requester))
  }
  const adjacency = new Map()
  for (const edge of acceptedConnections) {
    const a = String(edge.requester); const b = String(edge.recipient)
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  }
  const friends = adjacency.get(String(viewerId)) ?? new Set()
  return users.filter(user => !existing.has(String(user._id)) && !blocked.has(String(user._id)))
    .map(user => {
      const tags = Array.isArray(user.tags) ? user.tags : []
      const sharedTags = tags.filter(tag => me.tags.includes(tag))
      const mutualCount = [...(adjacency.get(String(user._id)) ?? [])].filter(id => friends.has(id)).length
      return { id: String(user._id), tags, sharedTags, mutualCount, score: mutualCount * 3 + sharedTags.length }
    })
    .sort((a, b) => b.score - a.score || b.mutualCount - a.mutualCount || a.id.localeCompare(b.id))
}
