import os
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
instance_path = os.path.join(BASE_DIR, 'instance')
os.makedirs(instance_path, exist_ok=True)

db_path = os.path.join(instance_path, 'shop.db').replace('\\', '/')
app = Flask(__name__, instance_path=instance_path, instance_relative_config=True)
app.config['SECRET_KEY'] = 'super-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'connect_args': {
        'check_same_thread': False,
        'timeout': 30
    }
}

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# --- Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    address = db.Column(db.String(500), nullable=True)
    payment_preference = db.Column(db.String(150), nullable=True)

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, nullable=False, default=0)
    category = db.Column(db.String(100), nullable=False, default='General')
    description = db.Column(db.Text, nullable=True)
    specs_config = db.Column(db.String(1000), nullable=True) # JSON serialized dict

class ProductVariant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    specs = db.Column(db.String(1000), nullable=False) # JSON: {"RAM": "8GB", "Storage": "256GB"}
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, nullable=False, default=0)

    product = db.relationship('Product', backref=db.backref('variants', lazy=True, cascade="all, delete-orphan"))

class CartItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    variant_id = db.Column(db.Integer, db.ForeignKey('product_variant.id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    selected_specs = db.Column(db.String(1000), nullable=True) # JSON serialized dict
    # Price after applying selected specs (RAM/Storage). Used for cart subtotal + orders.
    price = db.Column(db.Float, nullable=False, default=0.0)

    product = db.relationship('Product')
    variant = db.relationship('ProductVariant')

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    subtotal = db.Column(db.Float, nullable=False, default=0.0)
    tax = db.Column(db.Float, nullable=False, default=0.0)
    shipping_fee = db.Column(db.Float, nullable=False, default=0.0)
    total = db.Column(db.Float, nullable=False)
    shipping_address = db.Column(db.String(500), nullable=True)
    payment_method = db.Column(db.String(150), nullable=True)
    status = db.Column(db.String(50), default='Completed')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    items = db.relationship('OrderItem', backref='order', lazy=True)

class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    variant_id = db.Column(db.Integer, db.ForeignKey('product_variant.id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    selected_specs = db.Column(db.String(1000), nullable=True)
    
    product = db.relationship('Product')
    variant = db.relationship('ProductVariant')

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'detail': 'Unauthorized'}), 401
    return redirect(url_for('login'))

@app.errorhandler(500)
def handle_internal_server_error(error):
    if request.path.startswith('/api/'):
        return jsonify({'detail': 'Internal server error'}), 500
    return jsonify({'detail': 'Internal server error'}), 500

# --- Database Initialization ---
def init_db():
    with app.app_context():
        db.create_all()
        # Create admin user if not exists
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', password_hash=generate_password_hash('admin123'), is_admin=True)
            db.session.add(admin)
            db.session.commit()
            
        # Create some default products if empty
        if not Product.query.first():
            macbook = Product(name='MacBook Pro 14"', price=2499.00, stock=10, category='Laptops',
                        description='The ultimate pro laptop with supercharged M-series chips for incredible performance.',
                        specs_config=json.dumps({"Storage": ["512GB", "1TB"], "RAM": ["16GB", "32GB"]}))
            
            iphone = Product(name='iPhone 15 Pro', price=1099.00, stock=15, category='Phones',
                        description='Titanium design. Next-generation performance. Incredible camera system.',
                        specs_config=json.dumps({"Storage": ["128GB", "256GB"], "Color": ["Natural Titanium", "Blue Titanium"]}))

            db.session.add_all([macbook, iphone])
            db.session.commit()

            # Add variants for MacBook
            db.session.add_all([
                ProductVariant(product_id=macbook.id, specs=json.dumps({"Storage": "512GB", "RAM": "16GB"}), price=2499.00, stock=5),
                ProductVariant(product_id=macbook.id, specs=json.dumps({"Storage": "1TB", "RAM": "16GB"}), price=2699.00, stock=5),
                ProductVariant(product_id=macbook.id, specs=json.dumps({"Storage": "512GB", "RAM": "32GB"}), price=2899.00, stock=3),
                ProductVariant(product_id=macbook.id, specs=json.dumps({"Storage": "1TB", "RAM": "32GB"}), price=3099.00, stock=2)
            ])

            # Add variants for iPhone
            db.session.add_all([
                ProductVariant(product_id=iphone.id, specs=json.dumps({"Storage": "128GB", "Color": "Natural Titanium"}), price=1099.00, stock=5),
                ProductVariant(product_id=iphone.id, specs=json.dumps({"Storage": "256GB", "Color": "Natural Titanium"}), price=1199.00, stock=5),
                ProductVariant(product_id=iphone.id, specs=json.dumps({"Storage": "128GB", "Color": "Blue Titanium"}), price=1099.00, stock=3),
                ProductVariant(product_id=iphone.id, specs=json.dumps({"Storage": "256GB", "Color": "Blue Titanium"}), price=1199.00, stock=2)
            ])
            db.session.commit()

# --- Template Routes ---
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/product/<int:id>')
def product_detail_page(id):
    return render_template('product_detail.html', product_id=id)

@app.route('/cart')
@login_required
def cart():
    if current_user.is_admin:
        return redirect(url_for('home'))
    return render_template('cart.html')

@app.route('/checkout')
@login_required
def checkout_page():
    if current_user.is_admin:
        return redirect(url_for('home'))
    return render_template('checkout.html')

@app.route('/orders')
@login_required
def orders():
    if current_user.is_admin:
        return redirect(url_for('home'))
    return render_template('orders.html')

@app.route('/order/<int:id>')
@login_required
def order_detail_page(id):
    order = Order.query.get_or_404(id)
    if order.user_id != current_user.id and not current_user.is_admin:
        return redirect(url_for('orders'))
    return render_template('order_detail.html', order_id=id)

@app.route('/admin')
@login_required
def admin():
    if not current_user.is_admin:
        return redirect(url_for('home'))
    return render_template('admin.html')

@app.route('/login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return render_template('login.html')

@app.route('/register')
def register():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return render_template('register.html')

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html')

# --- Auth API Routes ---
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()
    if user and check_password_hash(user.password_hash, data.get('password')):
        login_user(user)
        return jsonify({'message': 'Logged in successfully', 'is_admin': user.is_admin})
    return jsonify({'detail': 'Invalid credentials'}), 401

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'detail': 'Username already exists'}), 400
        
    new_user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(new_user)
    db.session.commit()
    login_user(new_user)
    return jsonify({'message': 'Registered successfully'})

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({'message': 'Logged out successfully'})

@app.route('/api/auth/profile', methods=['PUT'])
@login_required
def api_update_profile():
    data = request.get_json()
    new_username = data.get('username')
    
    if new_username and new_username != current_user.username:
        if User.query.filter_by(username=new_username).first():
            return jsonify({'detail': 'Username already taken'}), 400
        current_user.username = new_username
        
    current_user.address = data.get('address', current_user.address)
    current_user.payment_preference = data.get('payment_preference', current_user.payment_preference)
    db.session.commit()
    return jsonify({'message': 'Profile updated successfully'})

@app.route('/api/auth/password', methods=['PUT'])
@login_required
def api_update_password():
    data = request.get_json()
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not check_password_hash(current_user.password_hash, current_password):
        return jsonify({'detail': 'Incorrect current password'}), 400
        
    current_user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'message': 'Password updated successfully'})

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    if current_user.is_authenticated:
        return jsonify({
            'id': current_user.id,
            'username': current_user.username,
            'is_admin': current_user.is_admin,
            'address': current_user.address,
            'payment_preference': current_user.payment_preference
        })
    return jsonify(None)

# --- Product API Routes ---
@app.route('/api/products', methods=['GET'])
def get_products():
    products = Product.query.all()
    result = []
    for p in products:
        specs_config = json.loads(p.specs_config) if p.specs_config else {}
        variants = [{
            'id': v.id,
            'specs': json.loads(v.specs),
            'price': v.price,
            'stock': v.stock
        } for v in p.variants]
        
        # Calculate default display price (first variant if exists)
        display_price = p.price
        display_stock = p.stock
        if p.variants and specs_config:
            # Match detail page logic: first option for each spec
            default_specs = {k: v[0] for k, v in specs_config.items()}
            for v in p.variants:
                if json.loads(v.specs) == default_specs:
                    display_price = v.price
                    display_stock = v.stock
                    break

        result.append({
            'id': p.id, 'name': p.name, 'price': p.price, 
            'stock': p.stock, 'category': p.category,
            'description': p.description,
            'specs_config': specs_config,
            'variants': variants,
            'total_stock': sum(v.stock for v in p.variants) if p.variants else p.stock,
            'min_price': min([v['price'] for v in variants] + [p.price]) if variants else p.price,
            'display_price': display_price,
            'display_stock': display_stock,
            'rating': 4.5, # Mock rating
            'rating_count': 128
        })
    return jsonify(result)

@app.route('/api/products/<int:id>', methods=['GET'])
def get_product(id):
    p = Product.query.get_or_404(id)
    specs_config = json.loads(p.specs_config) if p.specs_config else {}
    variants = [{
        'id': v.id,
        'specs': json.loads(v.specs),
        'price': v.price,
        'stock': v.stock
    } for v in p.variants]

    # Calculate default display price (first variant if exists)
    display_price = p.price
    display_stock = p.stock
    if p.variants and specs_config:
        default_specs = {k: v[0] for k, v in specs_config.items()}
        for v in p.variants:
            if json.loads(v.specs) == default_specs:
                display_price = v.price
                display_stock = v.stock
                break

    return jsonify({
        'id': p.id, 'name': p.name, 'price': p.price, 
        'stock': p.stock, 'category': p.category,
        'description': p.description,
        'specs_config': specs_config,
        'variants': variants,
        'total_stock': sum(v.stock for v in p.variants) if p.variants else p.stock,
        'min_price': min([v['price'] for v in variants] + [p.price]) if variants else p.price,
        'display_price': display_price,
        'display_stock': display_stock,
        'rating': 4.5, # Mock rating
        'rating_count': 128
    })

@app.route('/api/products', methods=['POST'])
@login_required
def create_product():
    if not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403
    data = request.get_json()
    new_product = Product(
        name=data['name'], 
        price=max(0, float(data['price'])), 
        stock=max(0, int(data['stock'])), 
        category=data.get('category', 'General'),
        description=data.get('description', ''),
        specs_config=json.dumps(data.get('specs_config', {}))
    )
    db.session.add(new_product)
    db.session.flush() # Get ID before adding variants

    variants_data = data.get('variants', [])
    for v_data in variants_data:
        variant = ProductVariant(
            product_id=new_product.id,
            specs=json.dumps(v_data.get('specs', {})),
            price=float(v_data.get('price', new_product.price)),
            stock=int(v_data.get('stock', 0))
        )
        db.session.add(variant)

    db.session.commit()
    return jsonify({'message': 'Product created', 'id': new_product.id})

@app.route('/api/products/<int:id>', methods=['PUT'])
@login_required
def update_product(id):
    if not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403
    p = Product.query.get_or_404(id)
    data = request.get_json()
    
    def get_default_specs(product):
        try:
            config = json.loads(product.specs_config)
            if not config: return None
            return {k: v[0] for k, v in config.items()}
        except:
            return None

    if 'name' in data: p.name = data['name']
    if 'price' in data: 
        p.price = max(0, float(data['price']))
        # Sync with base variant if exists
        default_specs = get_default_specs(p)
        if default_specs:
            for v in p.variants:
                if json.loads(v.specs) == default_specs:
                    v.price = p.price
                    break

    if 'stock' in data: p.stock = max(0, int(data['stock']))
    if 'category' in data: p.category = data['category']
    if 'description' in data: p.description = data['description']
    if 'specs_config' in data: p.specs_config = json.dumps(data['specs_config'])
    
    if 'variants' in data:
        print(f"DEBUG: Updating variants for product {id}")
        # Sync base price from default variant if present in the new list
        default_specs = get_default_specs(p)
        new_variants_data = data['variants']
        
        if default_specs:
            for v_data in new_variants_data:
                if v_data.get('specs') == default_specs:
                    p.price = max(0, float(v_data.get('price', p.price)))
                    break

        # Simple approach: delete existing and recreate
        ProductVariant.query.filter_by(product_id=p.id).delete()
        for v_data in new_variants_data:
            v_price = float(v_data.get('price', p.price))
            v_stock = int(v_data.get('stock', 0))
            v_specs = json.dumps(v_data.get('specs', {}))
            print(f"DEBUG: Adding variant specs={v_specs} price={v_price} stock={v_stock}")
            variant = ProductVariant(
                product_id=p.id,
                specs=v_specs,
                price=max(0, v_price),
                stock=max(0, v_stock)
            )
            db.session.add(variant)

    db.session.commit()
    return jsonify({'message': 'Product updated'})

@app.route('/api/products/<int:id>', methods=['DELETE'])
@login_required
def delete_product(id):
    if not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403
    p = Product.query.get_or_404(id)
    db.session.delete(p)
    db.session.commit()
    return jsonify({'message': 'Product deleted'})

@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories = db.session.query(Product.category).distinct().all()
    return jsonify({'categories': [c[0] for c in categories]})

@app.route('/api/products/search/<query>', methods=['GET'])
def search_products(query):
    products = Product.query.filter(Product.name.ilike(f'%{query}%')).all()
    return jsonify([{
        'id': p.id, 'name': p.name, 'price': p.price, 
        'stock': p.stock, 'category': p.category
    } for p in products])

# --- Cart API Routes ---
def _get_cart_data():
    items = CartItem.query.filter_by(user_id=current_user.id).all()
    cart_items = []
    total = 0
    for item in items:
        if item.product:
            subtotal = item.quantity * float(item.price)
            total += subtotal
            cart_items.append({
                'item_id': item.id,
                'product_id': item.product_id,
                'name': item.product.name,
                'price': item.price,
                'quantity': item.quantity,
                'subtotal': subtotal,
                'selected_specs': json.loads(item.selected_specs) if item.selected_specs else {}
            })
    return {'items': cart_items, 'total': total}

@app.route('/api/cart', methods=['GET'])
@login_required
def get_cart():
    if current_user.is_admin:
        return jsonify({'items': [], 'total': 0})
    return jsonify(_get_cart_data())

@app.route('/api/cart', methods=['POST'])
@login_required
def add_to_cart():
    if current_user.is_admin:
        return jsonify({'detail': 'Admins cannot order items'}), 403

    data = request.get_json()
    product_id = data.get('product_id')
    quantity = int(data.get('quantity', 1))
    if quantity <= 0:
        return jsonify({'detail': 'Quantity must be positive'}), 400
        
    specs = data.get('specs', {})
    specs_str = json.dumps(specs, sort_keys=True) if specs else None

    product = Product.query.get_or_404(product_id)

    # Find matching variant
    final_price = float(product.price)
    current_stock = product.stock
    matched_variant_id = None
    
    if product.variants:
        # Match specs
        matching_variant = None
        for v in product.variants:
            v_specs = json.loads(v.specs)
            # Compare dicts
            if v_specs == specs:
                matching_variant = v
                break
        
        if matching_variant:
            final_price = matching_variant.price
            current_stock = matching_variant.stock
            matched_variant_id = matching_variant.id

    if current_stock < quantity:
        return jsonify({'detail': 'Not enough stock'}), 400

    item = CartItem.query.filter_by(user_id=current_user.id, product_id=product_id, selected_specs=specs_str).first()
    if item:
        if current_stock < item.quantity + quantity:
            return jsonify({'detail': 'Not enough stock'}), 400
        item.quantity += quantity
        item.price = final_price
        item.variant_id = matched_variant_id
    else:
        item = CartItem(
            user_id=current_user.id,
            product_id=product_id,
            variant_id=matched_variant_id,
            quantity=quantity,
            selected_specs=specs_str,
            price=final_price,
        )
        db.session.add(item)

    db.session.commit()
    return jsonify({'message': 'Added to cart', 'cart': _get_cart_data()})

@app.route('/api/cart/item/<int:item_id>', methods=['PUT'])
@login_required
def update_cart_item(item_id):
    if current_user.is_admin: return jsonify({'detail': 'Unauthorized'}), 403
    data = request.get_json()
    quantity = int(data.get('quantity', 1))
    
    item = CartItem.query.filter_by(user_id=current_user.id, id=item_id).first()
    if item:
        stock_to_check = item.variant.stock if item.variant_id else item.product.stock
        if stock_to_check < quantity:
            return jsonify({'detail': 'Not enough stock'}), 400
            
        if quantity <= 0:
            db.session.delete(item)
        else:
            item.quantity = quantity
        db.session.commit()
        return jsonify({'cart': _get_cart_data()})
    return jsonify({'detail': 'Item not in cart'}), 404

@app.route('/api/cart/item/<int:item_id>', methods=['DELETE'])
@login_required
def delete_cart_item(item_id):
    if current_user.is_admin: return jsonify({'detail': 'Unauthorized'}), 403
    item = CartItem.query.filter_by(user_id=current_user.id, id=item_id).first()
    if item:
        db.session.delete(item)
        db.session.commit()
    return jsonify({'cart': _get_cart_data()})

@app.route('/api/cart', methods=['DELETE'])
@login_required
def clear_cart():
    if current_user.is_admin: return jsonify({'detail': 'Unauthorized'}), 403
    CartItem.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'message': 'Cart cleared'})

# --- Checkout & Orders API ---
@app.route('/api/checkout', methods=['POST'])
@login_required
def checkout():
    if current_user.is_admin:
        return jsonify({'detail': 'Admins cannot place orders'}), 403
        
    data = request.get_json()
    shipping_address = data.get('shipping_address')
    shipping_fee = float(data.get('shipping_fee', 0))
    payment_method = data.get('payment_method')
    
    items = CartItem.query.filter_by(user_id=current_user.id).all()
    if not items:
        return jsonify({'detail': 'Cart is empty'}), 400
        
    subtotal = 0
    order_items = []
    
    # Verify stock first
    for item in items:
        stock_to_check = item.variant.stock if item.variant_id else item.product.stock
        if stock_to_check < item.quantity:
            return jsonify({'detail': f'Not enough stock for {item.product.name}'}), 400
            
    # Create order items
    for item in items:
        # deduct stock with extra safety
        if item.variant_id:
            if item.variant.stock < item.quantity:
                db.session.rollback()
                return jsonify({'detail': f'Not enough stock for {item.product.name} (variant)'}), 400
            item.variant.stock -= item.quantity
        else:
            if item.product.stock < item.quantity:
                db.session.rollback()
                return jsonify({'detail': f'Not enough stock for {item.product.name}'}), 400
            item.product.stock -= item.quantity

        item_subtotal = item.quantity * float(item.price)
        subtotal += item_subtotal
        order_items.append(OrderItem(
            product_id=item.product_id,
            variant_id=item.variant_id,
            quantity=item.quantity,
            price=float(item.price),
            selected_specs=item.selected_specs
        ))
        db.session.delete(item) # clear cart
        
    tax = round(subtotal * 0.10, 2) # 10% tax
    total = subtotal + tax + shipping_fee
    
    order = Order(
        user_id=current_user.id, 
        subtotal=subtotal,
        tax=tax,
        shipping_fee=shipping_fee,
        total=total,
        shipping_address=shipping_address,
        payment_method=payment_method,
        status='Completed'
    )
    order.items = order_items
    db.session.add(order)
    db.session.commit()
    
    return jsonify({'message': 'Checkout successful', 'order_id': order.id})

@app.route('/api/orders', methods=['GET'])
@login_required
def get_orders():
    orders = Order.query.filter_by(user_id=current_user.id).order_by(Order.created_at.desc()).all()
    result = []
    for o in orders:
        items = []
        for i in o.items:
            items.append({
                'product_id': i.product_id,
                'name': i.product.name if i.product else f'Product #{i.product_id}',
                'quantity': i.quantity,
                'price': i.price,
                'subtotal': i.quantity * i.price,
                'selected_specs': json.loads(i.selected_specs) if i.selected_specs else {}
            })
        result.append({
            'id': o.id,
            'subtotal': o.subtotal,
            'tax': o.tax,
            'shipping_fee': o.shipping_fee,
            'total': o.total,
            'status': o.status,
            'created_at': o.created_at.strftime('%Y-%m-%d %H:%M'),
            'shipping_address': o.shipping_address,
            'payment_method': o.payment_method,
            'items': items
        })
    return jsonify(result)

@app.route('/api/orders/<int:id>/cancel', methods=['PUT'])
@login_required
def cancel_order(id):
    order = Order.query.get_or_404(id)
    if order.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403
        
    if order.status == 'Cancelled':
        return jsonify({'detail': 'Order is already cancelled'}), 400
    
    if order.status != 'Pending':
        return jsonify({'detail': 'Only pending orders can be cancelled'}), 400
        
    # Restore stock
    for item in order.items:
        if item.variant_id:
            # Use direct update to avoid lazy loading issues or missing objects
            ProductVariant.query.filter_by(id=item.variant_id).update({"stock": ProductVariant.stock + item.quantity})
        elif item.product_id:
            Product.query.filter_by(id=item.product_id).update({"stock": Product.stock + item.quantity})
            
    order.status = 'Cancelled'
    db.session.commit()
    return jsonify({'message': 'Order cancelled successfully'})

@app.route('/api/orders/<int:id>', methods=['GET'])
@login_required
def get_order_detail(id):
    order = Order.query.get_or_404(id)
    if order.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403
        
    items = []
    for i in order.items:
        items.append({
            'product_id': i.product_id,
            'name': i.product.name if i.product else f'Product #{i.product_id}',
            'quantity': i.quantity,
            'price': i.price,
            'subtotal': i.quantity * i.price,
            'selected_specs': json.loads(i.selected_specs) if i.selected_specs else {}
        })
        
    return jsonify({
        'id': order.id,
        'subtotal': order.subtotal,
        'tax': order.tax,
        'shipping_fee': order.shipping_fee,
        'total': order.total,
        'status': order.status,
        'created_at': order.created_at.strftime('%Y-%m-%d %H:%M'),
        'shipping_address': order.shipping_address,
        'payment_method': order.payment_method,
        'items': items
    })

@app.route('/api/analytics/summary', methods=['GET'])
@login_required
def get_analytics_summary():
    if not current_user.is_admin:
        return jsonify({'detail': 'Unauthorized'}), 403

    try:
        total_products = Product.query.count()
        total_orders = Order.query.count()
        total_revenue = db.session.query(db.func.sum(Order.total)).scalar() or 0
        avg_order_value = total_revenue / total_orders if total_orders > 0 else 0
        # Calculate stocks for all products
        all_products = Product.query.all()
        out_of_stock_data = []
        low_stock_data = []
        low_stock_count = 0

        for p in all_products:
            # More explicit variant stock check
            product_variants = ProductVariant.query.filter_by(product_id=p.id).all()
            if product_variants:
                effective_stock = sum(v.stock for v in product_variants)
            else:
                effective_stock = p.stock

            if effective_stock == 0:
                out_of_stock_data.append({'id': p.id, 'name': p.name, 'category': p.category})
            elif 0 < effective_stock <= 5:
                low_stock_data.append({'id': p.id, 'name': p.name, 'category': p.category, 'stock': effective_stock})
                low_stock_count += 1 # Update count for KPI card

        total_customers = User.query.filter_by(is_admin=False).count()
        total_variants = ProductVariant.query.count()

        # Top category
        top_category_result = db.session.query(Product.category, db.func.count(Product.id)).group_by(Product.category).order_by(db.func.count(Product.id).desc()).first()
        top_category = top_category_result[0] if top_category_result else 'N/A'

        # Daily revenue for the last 7 days
        from datetime import timedelta
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        daily_revenue_results = db.session.query(
            db.func.date(Order.created_at).label('date'), 
            db.func.sum(Order.total).label('total')
        ).filter(Order.created_at >= seven_days_ago).group_by(db.func.date(Order.created_at)).all()
        
        daily_revenue = {str(r[0]): float(r[1] or 0) for r in daily_revenue_results}
        
        # Category distribution
        categories_dist_results = db.session.query(Product.category, db.func.count(Product.id)).group_by(Product.category).all()
        category_distribution = {str(c[0]): int(c[1]) for c in categories_dist_results}

        # Recent orders (last 8)
        recent_orders = Order.query.order_by(Order.created_at.desc()).limit(8).all()
        recent_orders_data = []
        for o in recent_orders:
            recent_orders_data.append({
                'id': o.id,
                'total': float(o.total or 0),
                'status': o.status or 'Completed',
                'created_at': o.created_at.strftime('%b %d, %H:%M') if o.created_at else 'Unknown'
            })

        return jsonify({
            'total_products': int(total_products),
            'total_orders': int(total_orders),
            'total_revenue': float(total_revenue),
            'avg_order_value': float(avg_order_value),
            'low_stock_count': int(low_stock_count),
            'total_customers': int(total_customers),
            'total_variants': int(total_variants),
            'top_category': str(top_category),
            'out_of_stock_products': out_of_stock_data,
            'low_stock_products': low_stock_data,
            'daily_revenue': daily_revenue,
            'category_distribution': category_distribution,
            'recent_orders': recent_orders_data
        })
    except Exception as e:
        print(f"Analytics Error: {e}")
        return jsonify({'detail': f'Internal Server Error: {str(e)}'}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000, use_reloader=False)
