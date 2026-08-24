from trader_ai.embeddings import cosine, stub_embed


def test_stub_embed_normalized_and_stable():
    a = stub_embed("earnings iv crush")
    b = stub_embed("earnings iv crush")
    c = stub_embed("unrelated moon")
    assert a == b
    assert abs(sum(x * x for x in a) - 1) < 1e-6
    assert cosine(a, b) > cosine(a, c)
