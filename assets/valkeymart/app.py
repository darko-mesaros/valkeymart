from flask import Flask, render_template, request, redirect, url_for, session
import json
import os
import random
from redis import Redis
from redis.cluster import RedisCluster

app = Flask(__name__)
app.secret_key = os.urandom(24)

VALKEY_ENDPOINT = os.environ["REDIS_URL"]
# NOTE: Hardcoded for now
VALKEY_PORT = 6379
# Used for local testing as we do not have SSL locally
SSL = os.environ["SSL"].lower() in ('true')
LOCAL = os.environ["LOCAL"].lower() in ('true')

if LOCAL:
    # Do not connect to a cluster
    redis_client = Redis(host=VALKEY_ENDPOINT, port=VALKEY_PORT, ssl=SSL,
                         decode_responses=True)
else:
    # Is production, connect to a cluster
    redis_client = RedisCluster(host=VALKEY_ENDPOINT, port=VALKEY_PORT,
                                ssl=SSL, decode_responses=True)

PRODUCTS = ["Laptop", "Smartphone", "Headphones", "Smartwatch", "Tablet",
            "Camera", "Speaker", "E-reader", "Gaming Console",
            "Fitness Tracker"]


class ShoppingCart:
    def __init__(self, user_id):
        self.user_id = user_id
        self.cart_key = f"cart:{user_id}"

    def add_item(self, item_id, quantity):
        cart = self._get_cart()
        if item_id in cart:
            cart[item_id] += quantity
        else:
            cart[item_id] = quantity
        self._save_cart(cart)

    def remove_item(self, item_id, quantity):
        cart = self._get_cart()
        if item_id in cart:
            cart[item_id] -= quantity
            if cart[item_id] <= 0:
                del cart[item_id]
            # DELETE FROM VALKEY
            self._save_cart(cart)

    def get_cart(self):
        return self._get_cart()

    def _get_cart(self):
        # GET ITEMS FROM VALKEY
        cart_json = redis_client.get(self.cart_key)
        return json.loads(cart_json) if cart_json else {}

    def _save_cart(self, cart):
        cart_json = json.dumps(cart)
        # ADD TO VALKEY
        redis_client.set(self.cart_key, cart_json)


@app.route('/')
def index():
    if 'user_id' not in session:
        # This is us just generating a random user
        session['user_id'] = os.urandom(8).hex()
        # Select 3 random products
        featured_products = random.sample(PRODUCTS, 3)
        # Other "non featured"
        other_products = list(set(PRODUCTS) - set(featured_products))
        # Store the products into the memory database
        redis_client.set(f"featured:{session['user_id']}",
                         json.dumps(featured_products))
    else:
        # Retrieve the featured products from Redis
        featured_products = json.loads(
                redis_client.get(f"featured:{session['user_id']}") or '[]')
        other_products = list(set(PRODUCTS) - set(featured_products))

    cart = ShoppingCart(session['user_id'])
    return render_template('index.html',
                           cart=cart.get_cart(),
                           user=session['user_id'],
                           featured_products=featured_products,
                           other_products=other_products,
                           )


@app.route('/add', methods=['POST'])
def add_to_cart():
    item_id = request.form['item_id']
    quantity = int(request.form['quantity'])
    cart = ShoppingCart(session['user_id'])
    cart.add_item(item_id, quantity)
    return redirect(url_for('index'))


@app.route('/remove', methods=['POST'])
def remove_from_cart():
    item_id = request.form['item_id']
    cart = ShoppingCart(session['user_id'])
    cart.remove_item(item_id, 1)  # Remove one at a time
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(host="0.0.0.0")
