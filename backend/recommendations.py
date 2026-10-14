"""Graph-based friend recommendations, adapted from the project report."""

import re
from collections import defaultdict


SUGGESTED_TAGS = [
    "slow mornings", "books", "quiet walks", "music", "art", "gaming",
    "deep talks", "coffee", "nature", "movies", "journaling", "pets",
    "cooking", "photography", "stargazing", "learning", "plants", "poetry",
]

def normalize_tags(value):
    """Return up to eight unique, safe hashtags in their original order."""
    if not isinstance(value, list):
        return []
    result = []
    for raw in value:
        tag = re.sub(r"\s+", " ", str(raw).lower().lstrip("#").strip())
        valid = tag and tag[0].isalnum() and all(char.isalnum() or char in " &'’-" for char in tag)
        if 2 <= len(tag) <= 30 and valid and tag not in result:
            result.append(tag)
        if len(result) == 8:
            break
    return result


def pair_key(first, second):
    """A direction-independent key prevents duplicate connection requests."""
    return ":".join(sorted((str(first), str(second))))


def recommend(viewer_id, users, accepted_connections, all_connections, blocked_ids=()):
    """Rank candidates by mutual friends, then shared hashtags.

    Users are graph nodes and accepted connections are undirected edges. The
    recommendation list never includes the viewer, anyone with an existing
    request or connection, or either side of a block.
    """
    viewer_id = str(viewer_id)
    by_id = {str(user["_id"]): user for user in users}
    viewer = by_id.get(viewer_id)
    if viewer is None:
        return []

    excluded = {viewer_id, *(str(item) for item in blocked_ids)}
    for edge in all_connections:
        first, second = str(edge["requester"]), str(edge["recipient"])
        if first == viewer_id:
            excluded.add(second)
        elif second == viewer_id:
            excluded.add(first)

    graph = defaultdict(set)
    for edge in accepted_connections:
        first, second = str(edge["requester"]), str(edge["recipient"])
        graph[first].add(second)
        graph[second].add(first)

    friends = graph[viewer_id]
    my_tags = set(viewer.get("tags", []))
    suggestions = []
    for candidate_id, user in by_id.items():
        if candidate_id in excluded:
            continue
        tags = user.get("tags", [])
        shared = [tag for tag in tags if tag in my_tags]
        mutual_count = len(graph[candidate_id] & friends)
        suggestions.append({
            "id": candidate_id,
            "tags": tags,
            "sharedTags": shared,
            "mutualCount": mutual_count,
            "score": mutual_count * 3 + len(shared),
        })

    return sorted(
        suggestions,
        key=lambda item: (-item["score"], -item["mutualCount"], item["id"]),
    )
