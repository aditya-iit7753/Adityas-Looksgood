def recommend(style):
    mapping = {
        "casual outfit": {
            "top": "Oversized T-shirt",
            "bottom": "Denim jeans",
            "shoes": "Sneakers"
        },
        "formal outfit": {
            "top": "Blazer",
            "bottom": "Formal trousers",
            "shoes": "Loafers"
        }
    }
    return mapping.get(style, mapping["casual outfit"])