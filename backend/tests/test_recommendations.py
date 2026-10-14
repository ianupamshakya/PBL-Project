from backend.recommendations import normalize_tags, pair_key, recommend


def test_normalize_tags():
    assert normalize_tags(["#Books", " books ", "quiet walks", "x", "a@b", "MUSIC", "bad_tag"]) == ["books", "quiet walks", "music"]


def test_pair_key_is_direction_independent():
    assert pair_key("a", "b") == pair_key("b", "a")


def test_recommendation_graph_ranks_mutual_friends_and_excludes_existing_or_blocked():
    users = [
        {"_id": "me", "tags": ["books", "music"]},
        {"_id": "friend", "tags": ["music"]},
        {"_id": "mutual", "tags": ["books"]},
        {"_id": "shared", "tags": ["books", "music"]},
        {"_id": "pending", "tags": ["books", "music"]},
        {"_id": "blocked", "tags": ["books", "music"]},
    ]
    accepted = [{"requester": "me", "recipient": "friend"}, {"requester": "friend", "recipient": "mutual"}]
    all_connections = [*accepted, {"requester": "me", "recipient": "pending"}]
    result = recommend("me", users, accepted, all_connections, ["blocked"])
    assert [item["id"] for item in result] == ["mutual", "shared"]
    assert result[0]["mutualCount"] == 1
    assert result[1]["sharedTags"] == ["books", "music"]
    assert all("email" not in item and "alias" not in item for item in result)
