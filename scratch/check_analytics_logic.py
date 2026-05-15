import os
import json
from frontend_app import app, db, Product, ProductVariant, Order, User

with app.app_context():
    # Simulate the logic in get_analytics_summary
    total_products = Product.query.count()
    all_products = Product.query.all()
    out_of_stock_data = []
    low_stock_data = []
    low_stock_count = 0

    for p in all_products:
        if p.variants:
            effective_stock = sum(v.stock for v in p.variants)
        else:
            effective_stock = p.stock
        
        if effective_stock == 0:
            out_of_stock_data.append({'id': p.id, 'name': p.name, 'category': p.category})
        elif 0 < effective_stock <= 5:
            low_stock_data.append({'id': p.id, 'name': p.name, 'category': p.category, 'stock': effective_stock})
            low_stock_count += 1
            
    print(f"OOS Data ({len(out_of_stock_data)}): {out_of_stock_data}")
    print(f"Low Stock Data ({len(low_stock_data)}): {low_stock_data}")
