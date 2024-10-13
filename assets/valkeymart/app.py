from flask import Flask, render_template, request, redirect, url_for, session
import redis
import json
import os
from redis.cluster import RedisCluster as Redis

app = Flask(__name__)
app.secret_key = os.urandom(24)

VALKEY_ENDPOINT=os.environ["REDIS_URL"]
VALKEY_PORT=6379 # NOTE: Hardcoded for now
SSL=os.environ["SSL"].lower() in ('true')

redis_client = redis.Redis(host=VALKEY_ENDPOINT, port=VALKEY_PORT, ssl=SSL)

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
        session['user_id'] = os.urandom(8).hex()  # Generate a simple user ID
    cart = ShoppingCart(session['user_id'])
    return render_template('index.html', cart=cart.get_cart())

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
