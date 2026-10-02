"""
FEASTIFY - models/menu_model.py
Food menu for PRE-ORDERS. Prices live on the backend so nobody can change them from the browser.
"""

MENU_ITEMS = [
    ("samosa", "Crispy Vegetable Samosa", "Starters", 180, True),
    ("garden-salad", "Garden Harvest Salad", "Starters", 220, True),
    ("bruschetta", "Chef's Bruschetta", "Starters", 240, True),
    ("avocado-toast", "Avocado Egg Toast", "Starters", 260, False),
    ("mezze-bowl", "Mezze Bowl", "Starters", 280, True),
    ("tomato-soup", "Tomato Basil Soup", "Starters", 160, True),
    ("butter-chicken", "Butter Chicken", "Main Course", 420, False),
    ("dum-biryani", "Dum Biryani", "Main Course", 380, False),
    ("margherita", "Wood-fired Margherita", "Main Course", 360, True),
    ("burger", "Feastify Signature Burger", "Main Course", 340, False),
    ("pepper-steak", "Grilled Pepper Steak", "Main Course", 620, False),
    ("alfredo", "Creamy Alfredo Pasta", "Main Course", 350, True),
    ("choco-cake", "Belgian Chocolate Cake", "Desserts", 240, True),
    ("panna-cotta", "Berry Panna Cotta", "Desserts", 210, True),
    ("gelato", "Artisan Gelato", "Desserts", 180, True),
    ("pancakes", "Honey Pancake Stack", "Desserts", 220, True),
    ("donuts", "Glazed Donut Trio", "Desserts", 190, True),
    ("cheesecake", "Strawberry Cheesecake", "Desserts", 260, True),
    ("mocktail", "Sunset Mocktail", "Drinks", 180, True),
    ("cold-brew", "Cold Brew Coffee", "Drinks", 160, True),
    ("orange-juice", "Fresh Orange Juice", "Drinks", 140, True),
    ("iced-tea", "Lemon Iced Tea", "Drinks", 130, True),
    ("mojito", "Virgin Mojito", "Drinks", 170, True),
    ("masala-chai", "Masala Chai", "Drinks", 90, True),
]

MENU = {i[0]: {"id": i[0], "name": i[1], "category": i[2], "price": i[3], "veg": i[4]} for i in MENU_ITEMS}
MAX_QTY_PER_DISH = 10
MAX_DISHES = 20


def menu_list():
    return list(MENU.values())


def build_preorder(raw):
    """Check [{"id": "samosa", "qty": 2}, ...] and use backend prices. Returns (items, total, error)."""
    if not raw:
        return [], 0, None
    if not isinstance(raw, list) or len(raw) > MAX_DISHES:
        return None, 0, "Your food pre-order is not valid. Please try again."
    lines = {}
    for entry in raw:
        if not isinstance(entry, dict):
            return None, 0, "Your food pre-order is not valid. Please try again."
        dish = MENU.get(str(entry.get("id", "")))
        try:
            qty = int(entry.get("qty", 0))
        except (TypeError, ValueError):
            qty = 0
        if not dish:
            return None, 0, "One of the dishes in your pre-order is no longer on the menu."
        if not 1 <= qty <= MAX_QTY_PER_DISH:
            return None, 0, f"You can pre-order 1 to {MAX_QTY_PER_DISH} of each dish."
        lines[dish["id"]] = lines.get(dish["id"], 0) + qty
    items = []
    for dish_id, qty in lines.items():
        dish = MENU[dish_id]
        qty = min(qty, MAX_QTY_PER_DISH)
        items.append({"id": dish_id, "name": dish["name"], "price": dish["price"],
                      "qty": qty, "subtotal": dish["price"] * qty})
    return items, sum(i["subtotal"] for i in items), None