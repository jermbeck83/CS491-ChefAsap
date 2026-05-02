from flask import Blueprint, request, jsonify
from database.config import db_config
from database.db_helper import get_db_connection, get_cursor, handle_db_error
import re
import os
import time
from werkzeug.utils import secure_filename

# Create the blueprint
profile_bp = Blueprint('profile', __name__)

def validate_phone(phone):
    """Validate phone number format"""
    if not phone:
        return True  # Phone is optional
    phone_regex = r'^[\+]?[1-9]?[\s\-\(\)]?[\d\s\-\(\)]{7,15}$'
    return bool(re.match(phone_regex, phone.strip()))

def validate_image_url(url):
    """Basic validation for image URL"""
    if not url:
        return True  # Image is optional
    # Check if it's a valid URL pattern or file path
    return url.startswith(('http://', 'https://', '/uploads/', './uploads/', 'data:image/')) or '.' in url

@profile_bp.route('/chef/<int:chef_id>', methods=['GET'])
def get_chef_profile(chef_id):
    """Get chef profile information"""
    print(f"=== Getting chef profile for chef_id: {chef_id} ===")
    # Check if this is a public view (for customers) or private view (for chef themselves)
    show_private_info = request.args.get('private', 'false').lower() == 'true'
    
    conn = None
    cursor = None
    try:
        print(f"Connecting to database...")
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True, buffered=True)
        print(f"Database connected, fetching chef info...")
        
        # Get chef basic info with default address
        cursor.execute('''
            SELECT 
                c.id,
                c.first_name,
                c.last_name,
                c.email,
                c.phone,
                c.photo_url,
                c.description,
                c.meal_timings,
                c.created_at,
                ca.address_line1,
                ca.address_line2,
                ca.city,
                ca.state,
                ca.zip_code
            FROM chefs c
            LEFT JOIN chef_addresses ca ON c.id = ca.chef_id AND ca.is_default = TRUE
            WHERE c.id = %s
        ''', (chef_id,))
        
        chef_profile = cursor.fetchone()
        
        if not chef_profile:
            return jsonify({'error': 'Chef not found'}), 404
        
        # Format the address as "residency" (city, state)
        residency = ""
        if chef_profile['city'] and chef_profile['state']:
            residency = f"{chef_profile['city']}, {chef_profile['state']}"
        elif chef_profile['city']:
            residency = chef_profile['city']
        elif chef_profile['state']:
            residency = chef_profile['state']
        
        # Get chef cuisines - make sure to consume all results
        cursor.execute('''
            SELECT ct.name 
            FROM chef_cuisines cc
            JOIN cuisine_types ct ON cc.cuisine_id = ct.id
            WHERE cc.chef_id = %s
        ''', (chef_id,))
        
        cuisine_results = cursor.fetchall()
        cuisines = [row['name'] for row in cuisine_results]
        
        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Get chef ratings average
        cursor.execute('''
            SELECT average_rating, total_reviews FROM chef_rating_summary crs
            WHERE chef_id = %s''', (chef_id,))
        
        ratings_data = cursor.fetchone()
        
        # Process rating data
        total_ratings = ratings_data['total_reviews'] if ratings_data else 0
        avg_rating = round(float(ratings_data['average_rating']), 2) if ratings_data else 0
        
        rating_info = {
            'avg_rating': avg_rating,
            'total_ratings': total_ratings
        }

        cursor.execute('''
            SELECT r.customer_id, r.rating, r.comment FROM chef_rating r
            where chef_id = %s
            ORDER BY rating_id DESC''', (chef_id,))
        comments = cursor.fetchall()

        #returns rating avg and comments
        '''return jsonify({
            'chef': chef_id,
            'rating' : ratings_data['avg_rating'],
            'total_reviews': ratings_data['total_ratings'],
            'reviews': comments
        }), 200'''
        
        
        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # gather chef availability days and time range (based on meal)
        cursor.execute('''
            SELECT 
                cad.day_of_week, 
                cad.meal_type,
                cad.start_time, 
                cad.end_time
            FROM chef_availability_days cad
            WHERE cad.chef_id = %s
            ORDER BY 
                array_position(
                    ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
                    cad.day_of_week
                ),
                array_position(
                    ARRAY['breakfast', 'lunch', 'dinner'],
                    cad.meal_type
                );
        ''', (chef_id,))
        
        availability_data = cursor.fetchall()
        
        #organizes the fetched availability data to be grouped by day of the week
        availability = {}
        for row in availability_data:
            day = row['day_of_week']
            if day not in availability:
                availability[day] = []
            availability[day].append({
                'meal_type': row['meal_type'],
                'start_time': str(row['start_time']),
                'end_time': str(row['end_time'])
            })

        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Get chef cuisine photos
        cursor.execute('''
            SELECT 
                cuisine_type,
                photo_url,
                photo_title,
                photo_description,
                is_featured,
                display_order,
                created_at
            FROM chef_cuisine_photos 
            WHERE chef_id = %s
            ORDER BY cuisine_type, is_featured DESC, display_order ASC, created_at ASC
        ''', (chef_id,))
        
        cuisine_photos_raw = cursor.fetchall()
        
        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Group cuisine photos by cuisine type
        cuisine_photos = {}
        for photo in cuisine_photos_raw:
            cuisine = photo['cuisine_type']
            if cuisine not in cuisine_photos:
                cuisine_photos[cuisine] = []
            
            photo_data = {
                'photo_url': photo['photo_url'],
                'photo_title': photo['photo_title'],
                'photo_description': photo['photo_description'],
                'is_featured': photo['is_featured'],
                'display_order': photo['display_order'],
                'created_at': photo['created_at'].isoformat() if photo['created_at'] else None
            }
            cuisine_photos[cuisine].append(photo_data)
        
        # Build profile data based on access level
        profile_data = {
            'chef_id': chef_profile['id'],
            'first_name': chef_profile['first_name'],
            'last_name': chef_profile['last_name'],
            'photo_url': chef_profile['photo_url'],
            'description': chef_profile['description'],
            'meal_timings': chef_profile['meal_timings'] if chef_profile['meal_timings'] else [],
            'residency': residency,
            'cuisines': cuisines,
            'avg_rating' : rating_info['avg_rating'],
            'total_reviews': rating_info['total_ratings'],
            'reviews': comments,
            'cuisine_photos': cuisine_photos,
            'member_since': chef_profile['created_at'].strftime('%B %Y') if chef_profile['created_at'] else None,
            'availability': availability,
        }
        
        # Only include private information if explicitly requested (for chef's own profile or admin access)
        if show_private_info:
            profile_data.update({
                'email': chef_profile['email'],
                'phone': chef_profile['phone'],
                'full_address': {
                    'address_line1': chef_profile['address_line1'],
                    'address_line2': chef_profile['address_line2'],
                    'city': chef_profile['city'],
                    'state': chef_profile['state'],
                    'zip_code': chef_profile['zip_code']
                }
            })
        else:
            # For public view, only show city and state (no full address)
            profile_data['public_location'] = residency
        
        return jsonify({'profile': profile_data}), 200
        
    except Exception as e:
        print(f"ERROR in get_chef_profile: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        # Ensure proper cleanup
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@profile_bp.route('/chef/<int:chef_id>/public', methods=['GET'])
def get_chef_public_profile(chef_id):
    """Get chef public profile information (for customer viewing)"""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True, buffered=True)
        
        # Get chef basic info (excluding private information)
        cursor.execute('''
            SELECT 
                c.id,
                c.first_name,
                c.last_name,
                c.photo_url,
                c.description,
                c.meal_timings,
                c.created_at,
                ca.city,
                ca.state
            FROM chefs c
            LEFT JOIN chef_addresses ca ON c.id = ca.chef_id AND ca.is_default = TRUE
            WHERE c.id = %s
        ''', (chef_id,))
        
        chef_profile = cursor.fetchone()
        
        if not chef_profile:
            return jsonify({'error': 'Chef not found'}), 404
        
        # Format the public location (city, state only)
        public_location = ""
        if chef_profile['city'] and chef_profile['state']:
            public_location = f"{chef_profile['city']}, {chef_profile['state']}"
        elif chef_profile['city']:
            public_location = chef_profile['city']
        elif chef_profile['state']:
            public_location = chef_profile['state']
        
        # Get chef cuisines
        cursor.execute('''
            SELECT ct.name 
            FROM chef_cuisines cc
            JOIN cuisine_types ct ON cc.cuisine_id = ct.id
            WHERE cc.chef_id = %s
        ''', (chef_id,))
        
        cuisine_results = cursor.fetchall()
        cuisines = [row['name'] for row in cuisine_results]
        
        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Get chef ratings average
        cursor.execute('''
            SELECT average_rating, total_reviews FROM chef_rating_summary crs
            WHERE chef_id = %s''', (chef_id,))
        
        ratings_data = cursor.fetchone()
        
        # Process rating data
        total_ratings = ratings_data['total_reviews'] if ratings_data else 0
        avg_rating = round(float(ratings_data['average_rating']), 2) if ratings_data else 0
        
        rating_info = {
            'avg_rating': avg_rating,
            'total_ratings': total_ratings
        }

        # gather chef availability days and time range 
        cursor.execute('''
            SELECT 
                cad.day_of_week, 
                cad.meal_type,
                cad.start_time, 
                cad.end_time
            FROM chef_availability_days cad
            WHERE cad.chef_id = %s
            ORDER BY 
                array_position(
                    ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
                    cad.day_of_week
                ),
                array_position(
                    ARRAY['breakfast', 'lunch', 'dinner'],
                    cad.meal_type
                );
        ''', (chef_id,))

        availability_data = cursor.fetchall()

        #organizes the fetched availability data to be grouped by day of the week
        availability = {}
        for row in availability_data:
            day = row['day_of_week']
            if day not in availability:
                availability[day] = []
            availability[day].append({
                'meal_type': row['meal_type'],
                'start_time': str(row['start_time']),
                'end_time': str(row['end_time'])
            })

        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Get chef cuisine photos
        cursor.execute('''
            SELECT 
                cuisine_type,
                photo_url,
                photo_title,
                photo_description,
                is_featured,
                display_order,
                created_at
            FROM chef_cuisine_photos 
            WHERE chef_id = %s
            ORDER BY cuisine_type, is_featured DESC, display_order ASC, created_at ASC
        ''', (chef_id,))
        
        cuisine_photos_raw = cursor.fetchall()
        
        # Clear any remaining results
        try:
            cursor.nextset()
        except:
            pass
        
        # Group cuisine photos by cuisine type
        cuisine_photos = {}
        for photo in cuisine_photos_raw:
            cuisine = photo['cuisine_type']
            if cuisine not in cuisine_photos:
                cuisine_photos[cuisine] = []
            
            photo_data = {
                'photo_url': photo['photo_url'],
                'photo_title': photo['photo_title'],
                'photo_description': photo['photo_description'],
                'is_featured': photo['is_featured'],
                'display_order': photo['display_order'],
                'created_at': photo['created_at'].isoformat() if photo['created_at'] else None
            }
            cuisine_photos[cuisine].append(photo_data)
        
        # Public profile data (no email, phone, or full address)
        profile_data = {
            'chef_id': chef_profile['id'],
            'first_name': chef_profile['first_name'],
            'last_name': chef_profile['last_name'],
            'photo_url': chef_profile['photo_url'],
            'description': chef_profile['description'],
            'meal_timings': chef_profile['meal_timings'] if chef_profile['meal_timings'] else [],
            'public_location': public_location,
            'cuisines': cuisines,
            'cuisine_photos': cuisine_photos,
            'average_rating': float(rating_info['avg_rating'] or 0),
            'total_ratings': rating_info['total_ratings'] or 0,
            'member_since': chef_profile['created_at'].strftime('%B %Y') if chef_profile['created_at'] else None,
            'availability': availability,
            'is_public_view': True  # Flag to indicate this is public view
        }
        
        return jsonify({'profile': profile_data}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Ensure proper cleanup
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@profile_bp.route('/chef/<int:chef_id>', methods=['PUT'])
def update_chef_profile(chef_id):
    """Update chef profile information - All fields editable except email"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Extract fields that can be updated (email is NOT editable)
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        phone = data.get('phone')
        photo_url = data.get('photo_url')
        description = data.get('description')  # About/bio field
        meal_timings = data.get('meal_timings')  # Array of meal timings: ['Breakfast', 'Lunch', 'Dinner']
        
        # Address fields - all editable
        address_line1 = data.get('address_line1')
        address_line2 = data.get('address_line2', '')
        city = data.get('city')
        state = data.get('state')
        zip_code = data.get('zip_code')
        
        # Check if user is trying to update email (not allowed)
        if 'email' in data:
            return jsonify({'error': 'Email address cannot be changed'}), 400
        
        # Validate names cannot be empty (if provided)
        if first_name is not None and (not first_name or not first_name.strip()):
            return jsonify({'error': 'First name cannot be empty'}), 400
        
        if last_name is not None and (not last_name or not last_name.strip()):
            return jsonify({'error': 'Last name cannot be empty'}), 400
        
        if phone and not validate_phone(phone):
            return jsonify({'error': 'Invalid phone number format'}), 400
        
        if photo_url and not validate_image_url(photo_url):
            return jsonify({'error': 'Invalid image URL format'}), 400
        
        # Validate description length (max 500 chars based on DB schema)
        if description is not None and len(description) > 500:
            return jsonify({'error': 'Description cannot exceed 500 characters'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if chef exists
        cursor.execute('SELECT id FROM chefs WHERE id = %s', (chef_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Chef not found'}), 404
        
        # Build dynamic UPDATE query based on provided fields
        update_fields = []
        update_values = []
        
        if first_name is not None:
            update_fields.append('first_name = %s')
            update_values.append(first_name)
        
        if last_name is not None:
            update_fields.append('last_name = %s')
            update_values.append(last_name)
        
        if phone is not None:
            update_fields.append('phone = %s')
            update_values.append(phone)
        
        if photo_url is not None:
            update_fields.append('photo_url = %s')
            update_values.append(photo_url)
        
        if description is not None:
            update_fields.append('description = %s')
            update_values.append(description)
        
        if meal_timings is not None:
            update_fields.append('meal_timings = %s')
            update_values.append(meal_timings)
        
        # Always update the timestamp
        update_fields.append('updated_at = NOW()')
        update_values.append(chef_id)
        
        # Only update if there are fields to update
        if len(update_fields) > 1:  # More than just the timestamp
            query = f"UPDATE chefs SET {', '.join(update_fields)} WHERE id = %s"
            cursor.execute(query, update_values)
        
        # Update address if provided
        if address_line1 and city and state and zip_code:
            # Get coordinates for the address
            from services.geocoding_service import geocoding_service
            
            # Build full address string
            full_address = f"{address_line1}"
            if address_line2:
                full_address += f", {address_line2}"
            full_address += f", {city}, {state} {zip_code}"
            
            coords = geocoding_service.geocode_address(full_address)
            latitude = coords[0] if coords else None
            longitude = coords[1] if coords else None
            
            # Check if default address exists
            cursor.execute('''
                SELECT id FROM chef_addresses 
                WHERE chef_id = %s AND is_default = TRUE
            ''', (chef_id,))
            
            address_record = cursor.fetchone()
            
            if address_record:
                # Update existing default address with coordinates
                cursor.execute('''
                    UPDATE chef_addresses 
                    SET address_line1 = %s, address_line2 = %s, city = %s, state = %s, zip_code = %s,
                        latitude = %s, longitude = %s
                    WHERE chef_id = %s AND is_default = TRUE
                ''', (address_line1, address_line2, city, state, zip_code, latitude, longitude, chef_id))
            else:
                # Create new default address with coordinates
                cursor.execute('''
                    INSERT INTO chef_addresses (chef_id, address_line1, address_line2, city, state, zip_code, latitude, longitude, is_default)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ''', (chef_id, address_line1, address_line2, city, state, zip_code, latitude, longitude))
            
            # Log geocoding results
            if latitude and longitude:
                print(f"Geocoded chef {chef_id} address: {city}, {state} -> ({latitude}, {longitude})")
            else:
                print(f"Warning: Could not geocode chef {chef_id} address: {address_line1}, {city}, {state} {zip_code}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Profile updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/chef/<int:chef_id>/cuisines', methods=['PUT'])
def update_chef_cuisines(chef_id):
    """Update chef's cuisines"""
    try:
        data = request.get_json()
        
        if not data or 'cuisines' not in data:
            return jsonify({'error': 'Cuisines list is required'}), 400
        
        cuisine_names = data.get('cuisines', [])
        
        if not isinstance(cuisine_names, list):
            return jsonify({'error': 'Cuisines must be an array'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if chef exists
        cursor.execute('SELECT id FROM chefs WHERE id = %s', (chef_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Chef not found'}), 404
        
        # Delete existing cuisines
        cursor.execute('DELETE FROM chef_cuisines WHERE chef_id = %s', (chef_id,))
        
        # Add new cuisines
        for cuisine_name in cuisine_names:
            # Get cuisine_id from cuisine_types table
            cursor.execute('SELECT id FROM cuisine_types WHERE name = %s', (cuisine_name,))
            cuisine_result = cursor.fetchone()
            
            if cuisine_result:
                cuisine_id = cuisine_result[0]
                # Insert into chef_cuisines
                cursor.execute('''
                    INSERT INTO chef_cuisines (chef_id, cuisine_id)
                    VALUES (%s, %s)
                    ON CONFLICT (chef_id, cuisine_id) DO NOTHING
                ''', (chef_id, cuisine_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Cuisines updated successfully', 'cuisines': cuisine_names}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/cuisines', methods=['GET'])
def get_all_cuisines():
    """Get all available cuisine types"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        cursor.execute('SELECT id, name FROM cuisine_types ORDER BY name')
        cuisines = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        cuisine_list = [{'id': c['id'], 'name': c['name']} for c in cuisines]
        
        return jsonify({'cuisines': cuisine_list}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/customer/<int:customer_id>', methods=['GET'])
def get_customer_profile(customer_id):
    """Get customer profile information"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        # Get customer basic info with default address
        cursor.execute('''
            SELECT 
                c.id,
                c.first_name,
                c.last_name,
                c.email,
                c.phone,
                c.photo_url,
                c.allergy_notes,
                c.created_at,
                ca.address_line1,
                ca.address_line2,
                ca.city,
                ca.state,
                ca.zip_code
            FROM customers c
            LEFT JOIN customer_addresses ca ON c.id = ca.customer_id AND ca.is_default = TRUE
            WHERE c.id = %s
        ''', (customer_id,))
        
        customer_profile = cursor.fetchone()
        
        if not customer_profile:
            return jsonify({'error': 'Customer not found'}), 404
        
        # Format the address as "residency" (city, state)
        residency = ""
        if customer_profile['city'] and customer_profile['state']:
            residency = f"{customer_profile['city']}, {customer_profile['state']}"
        elif customer_profile['city']:
            residency = customer_profile['city']
        elif customer_profile['state']:
            residency = customer_profile['state']
        
        profile_data = {
            'customer_id': customer_profile['id'],
            'first_name': customer_profile['first_name'],
            'last_name': customer_profile['last_name'],
            'email': customer_profile['email'],
            'phone': customer_profile['phone'],
            'photo_url': customer_profile['photo_url'],
            'allergy_notes': customer_profile['allergy_notes'],
            'residency': residency,
            'full_address': {
                'address_line1': customer_profile['address_line1'],
                'address_line2': customer_profile['address_line2'],
                'city': customer_profile['city'],
                'state': customer_profile['state'],
                'zip_code': customer_profile['zip_code']
            },
            'member_since': customer_profile['created_at'].strftime('%B %Y') if customer_profile['created_at'] else None
        }
        
        cursor.close()
        conn.close()
        
        return jsonify({'profile': profile_data}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/customer/<int:customer_id>', methods=['PUT'])
def update_customer_profile(customer_id):
    """Update customer profile information - All fields editable except email"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Extract fields that can be updated (email is NOT editable)
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        phone = data.get('phone')
        photo_url = data.get('photo_url')
        allergy_notes = data.get('allergy_notes')
        
        # Address fields - all editable
        address_line1 = data.get('address_line1')
        address_line2 = data.get('address_line2', '')
        city = data.get('city')
        state = data.get('state')
        zip_code = data.get('zip_code')
        
        # Check if user is trying to update email (not allowed)
        if 'email' in data:
            return jsonify({'error': 'Email address cannot be changed'}), 400
        
        # Validate names cannot be empty (if provided)
        if first_name is not None and (not first_name or not first_name.strip()):
            return jsonify({'error': 'First name cannot be empty'}), 400
        
        if last_name is not None and (not last_name or not last_name.strip()):
            return jsonify({'error': 'Last name cannot be empty'}), 400
        
        if phone and not validate_phone(phone):
            return jsonify({'error': 'Invalid phone number format'}), 400
        
        if photo_url and not validate_image_url(photo_url):
            return jsonify({'error': 'Invalid image URL format'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if customer exists
        cursor.execute('SELECT id FROM customers WHERE id = %s', (customer_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Customer not found'}), 404
        
        # Build dynamic UPDATE query based on provided fields
        update_fields = []
        update_values = []
        
        if first_name is not None:
            update_fields.append('first_name = %s')
            update_values.append(first_name)
        
        if last_name is not None:
            update_fields.append('last_name = %s')
            update_values.append(last_name)
        
        if phone is not None:
            update_fields.append('phone = %s')
            update_values.append(phone)
        
        if photo_url is not None:
            update_fields.append('photo_url = %s')
            update_values.append(photo_url)
        
        if allergy_notes is not None:
            update_fields.append('allergy_notes = %s')
            update_values.append(allergy_notes)
        
        # Always update the timestamp
        update_fields.append('updated_at = NOW()')
        update_values.append(customer_id)
        
        # Only update if there are fields to update
        if len(update_fields) > 1:  # More than just the timestamp
            query = f"UPDATE customers SET {', '.join(update_fields)} WHERE id = %s"
            cursor.execute(query, update_values)
        
        # Update address if provided
        if address_line1 and city and state and zip_code:
            # Get coordinates for the address
            from services.geocoding_service import geocoding_service
            
            # Build full address string
            full_address = f"{address_line1}"
            if address_line2:
                full_address += f", {address_line2}"
            full_address += f", {city}, {state} {zip_code}"
            
            coords = geocoding_service.geocode_address(full_address)
            latitude = coords[0] if coords else None
            longitude = coords[1] if coords else None
            
            # Check if default address exists
            cursor.execute('''
                SELECT id FROM customer_addresses 
                WHERE customer_id = %s AND is_default = TRUE
            ''', (customer_id,))
            
            address_record = cursor.fetchone()
            
            if address_record:
                # Update existing default address with coordinates
                cursor.execute('''
                    UPDATE customer_addresses 
                    SET address_line1 = %s, address_line2 = %s, city = %s, state = %s, zip_code = %s,
                        latitude = %s, longitude = %s
                    WHERE customer_id = %s AND is_default = TRUE
                ''', (address_line1, address_line2, city, state, zip_code, latitude, longitude, customer_id))
            else:
                # Create new default address with coordinates
                cursor.execute('''
                    INSERT INTO customer_addresses (customer_id, address_line1, address_line2, city, state, zip_code, latitude, longitude, is_default)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ''', (customer_id, address_line1, address_line2, city, state, zip_code, latitude, longitude))
            
            # Log geocoding results
            if latitude and longitude:
                print(f"Geocoded customer {customer_id} address: {city}, {state} -> ({latitude}, {longitude})")
            else:
                print(f"Warning: Could not geocode customer {customer_id} address: {address_line1}, {city}, {state} {zip_code}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Profile updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/customer/<int:customer_id>/photo', methods=['POST'])
def upload_customer_photo(customer_id):
    """Upload and update customer profile photo - stores as base64 in DB"""
    try:
        if 'photo' not in request.files:
            return jsonify({'error': 'No photo uploaded'}), 400
        photo = request.files['photo']
        if photo.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        import base64
        photo_data = photo.read()
        ext = photo.filename.rsplit('.', 1)[-1].lower()
        mime = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
        b64 = base64.b64encode(photo_data).decode('utf-8')
        photo_url = f'data:{mime};base64,{b64}'

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE customers SET photo_url = %s WHERE id = %s', (photo_url, customer_id))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'photo_url': photo_url}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@profile_bp.route('/chef/<int:chef_id>/photo', methods=['POST'])
def upload_chef_photo(chef_id):
    """Upload and update chef profile photo - stores as base64 in DB"""
    try:
        if 'photo' not in request.files:
            return jsonify({'error': 'No photo uploaded'}), 400
        photo = request.files['photo']
        if photo.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        import base64
        photo_data = photo.read()
        ext = photo.filename.rsplit('.', 1)[-1].lower()
        mime = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
        b64 = base64.b64encode(photo_data).decode('utf-8')
        photo_url = f'data:{mime};base64,{b64}'

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE chefs SET photo_url = %s WHERE id = %s', (photo_url, chef_id))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'photo_url': photo_url}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@profile_bp.route('/chef/<int:chef_id>/photo', methods=['GET'])
def get_chef_photo(chef_id):
    """Fetch the chef's profile photo URL from the database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT photo_url FROM chefs WHERE id = %s', (chef_id,))
        
        result = cursor.fetchone() 
        
        cursor.close()
        conn.close()

        if result:
            photo_url = result[0]
            if photo_url:
                return jsonify({'chef_id': chef_id, 'photo_url': photo_url}), 200
            else:
                return jsonify({'chef_id': chef_id, 'photo_url': None, 'message': 'No photo uploaded yet'}), 200
        else:
            return jsonify({'error': 'Chef not found'}), 404

    except Exception as e:
        print(f"Error fetching photo for chef {chef_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@profile_bp.route('/chef/<int:chef_id>/rating', methods=['POST'])
def add_chef_rating():
    data = request.get_json()
    chef_id = data.get('chef_id')
    customer_id = data.get('customer_id')
    #currently ratings will be done on chef profile so booking_id may be needed later on
    #booking_id = data.get('booking_id')
    rating = data.get('rating')
    comment = data.get('comment', '')

    if not all([chef_id, customer_id, rating]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)

        cursor.execute('''
            INSERT INTO chef_rating(chef_id, customer_id, rating, comment)
            VALUES (%s, %s, %s, %s)''', (chef_id, customer_id, rating, comment))
        
        conn.commit()
        return jsonify({'message': 'Rating successfully posted'}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# ============= Chef Cuisine Photos Management =============

@profile_bp.route('/chef/<int:chef_id>/cuisine-photos', methods=['POST'])
def upload_chef_cuisine_photos(chef_id):
    """Upload cuisine photos for chef"""
    try:
        # Check if chef exists
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM chefs WHERE id = %s', (chef_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Chef not found'}), 404

        # Get form data
        cuisine_type = request.form.get('cuisine_type', '').strip()
        photo_title = request.form.get('photo_title', '').strip()
        photo_description = request.form.get('photo_description', '').strip()
        is_featured = request.form.get('is_featured', '').lower() == 'true'

        if not cuisine_type:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Cuisine type is required'}), 400

        # Check current photo limits
        # Limit: Max 10 photos per cuisine type, max 50 total photos per chef
        MAX_PHOTOS_PER_CUISINE = 10
        MAX_TOTAL_PHOTOS_PER_CHEF = 50
        
        # Check current photo count for this cuisine
        cursor.execute('''
            SELECT COUNT(*) as cuisine_count 
            FROM chef_cuisine_photos 
            WHERE chef_id = %s AND cuisine_type = %s
        ''', (chef_id, cuisine_type))
        current_cuisine_count = cursor.fetchone()[0]
        
        # Check total photo count for chef
        cursor.execute('''
            SELECT COUNT(*) as total_count 
            FROM chef_cuisine_photos 
            WHERE chef_id = %s
        ''', (chef_id,))
        current_total_count = cursor.fetchone()[0]
        
        # Check for uploaded photos
        uploaded_photos = []
        photo_files = request.files.getlist('photos')  # Support multiple photos
        
        if not photo_files or all(f.filename == '' for f in photo_files):
            cursor.close()
            conn.close()
            return jsonify({'error': 'At least one photo is required'}), 400
        
        # Check if adding new photos would exceed limits
        new_photos_count = len([f for f in photo_files if f.filename != ''])
        
        if current_cuisine_count + new_photos_count > MAX_PHOTOS_PER_CUISINE:
            cursor.close()
            conn.close()
            return jsonify({
                'error': f'Photo limit exceeded for {cuisine_type} cuisine. Maximum {MAX_PHOTOS_PER_CUISINE} photos allowed per cuisine type.',
                'current_count': current_cuisine_count,
                'max_allowed': MAX_PHOTOS_PER_CUISINE,
                'trying_to_add': new_photos_count
            }), 400
        
        if current_total_count + new_photos_count > MAX_TOTAL_PHOTOS_PER_CHEF:
            cursor.close()
            conn.close()
            return jsonify({
                'error': f'Total photo limit exceeded. Maximum {MAX_TOTAL_PHOTOS_PER_CHEF} photos allowed per chef.',
                'current_total': current_total_count,
                'max_allowed': MAX_TOTAL_PHOTOS_PER_CHEF,
                'trying_to_add': new_photos_count
            }), 400

        # Create directory if it doesn't exist (use absolute path)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cuisine_photos_dir = os.path.join(base_dir, 'static', 'cuisine_photos')
        os.makedirs(cuisine_photos_dir, exist_ok=True)

        # Process each photo
        for i, photo in enumerate(photo_files):
            if photo and photo.filename != '':
                # Generate unique filename
                file_extension = photo.filename.rsplit('.', 1)[-1].lower()
                if file_extension not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                    cursor.close()
                    conn.close()
                    return jsonify({'error': f'Invalid file type: {file_extension}. Allowed: jpg, jpeg, png, gif, webp'}), 400

                timestamp = int(time.time())
                filename = secure_filename(f"chef{chef_id}_cuisine_{cuisine_type.replace(' ', '_')}_{timestamp}_{i}.{file_extension}")
                filepath = os.path.join(cuisine_photos_dir, filename)
                photo.save(filepath)

                photo_url = f"/static/cuisine_photos/{filename}"
                
                # Get display order (find max + 1)
                cursor.execute('''
                    SELECT MAX(display_order) as max_order 
                    FROM chef_cuisine_photos 
                    WHERE chef_id = %s AND cuisine_type = %s
                ''', (chef_id, cuisine_type))
                result = cursor.fetchone()
                display_order = (result[0] or 0) + 1 + i

                # Insert photo record (PostgreSQL with RETURNING)
                cursor.execute('''
                    INSERT INTO chef_cuisine_photos 
                    (chef_id, cuisine_type, photo_url, photo_title, photo_description, is_featured, display_order)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                ''', (chef_id, cuisine_type, photo_url, photo_title, photo_description, is_featured, display_order))
                photo_id = cursor.fetchone()[0]

                uploaded_photos.append({
                    'photo_id': photo_id,
                    'photo_url': photo_url,
                    'cuisine_type': cuisine_type,
                    'photo_title': photo_title,
                    'photo_description': photo_description,
                    'is_featured': is_featured,
                    'display_order': display_order
                })

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({
            'message': f'Successfully uploaded {len(uploaded_photos)} cuisine photos',
            'photos': uploaded_photos
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos', methods=['GET'])
def get_chef_cuisine_photos(chef_id):
    """Get all cuisine photos for a chef"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        cuisine_type = request.args.get('cuisine_type')  # Optional filter
        
        if cuisine_type:
            cursor.execute('''
                SELECT * FROM chef_cuisine_photos 
                WHERE chef_id = %s AND cuisine_type = %s
                ORDER BY is_featured DESC, display_order ASC, created_at ASC
            ''', (chef_id, cuisine_type))
        else:
            cursor.execute('''
                SELECT * FROM chef_cuisine_photos 
                WHERE chef_id = %s
                ORDER BY cuisine_type, is_featured DESC, display_order ASC, created_at ASC
            ''', (chef_id,))
        
        photos = cursor.fetchall()
        
        # Group photos by cuisine type
        cuisine_photos = {}
        for photo in photos:
            cuisine = photo['cuisine_type']
            if cuisine not in cuisine_photos:
                cuisine_photos[cuisine] = []
            
            photo_data = {
                'photo_id': photo['id'],
                'photo_url': photo['photo_url'],
                'photo_title': photo['photo_title'],
                'photo_description': photo['photo_description'],
                'is_featured': photo['is_featured'],
                'display_order': photo['display_order'],
                'created_at': photo['created_at'].isoformat() if photo['created_at'] else None,
                'updated_at': photo['updated_at'].isoformat() if photo['updated_at'] else None
            }
            cuisine_photos[cuisine].append(photo_data)
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'chef_id': chef_id,
            'cuisine_photos': cuisine_photos,
            'total_photos': len(photos)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/<int:photo_id>', methods=['PUT'])
def update_cuisine_photo(chef_id, photo_id):
    """Update cuisine photo details"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if photo exists and belongs to chef
        cursor.execute('''
            SELECT id FROM chef_cuisine_photos 
            WHERE id = %s AND chef_id = %s
        ''', (photo_id, chef_id))
        
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Photo not found'}), 404
        
        # Build update query dynamically
        update_fields = []
        params = []
        
        if 'photo_title' in data:
            update_fields.append('photo_title = %s')
            params.append(data['photo_title'])
        
        if 'photo_description' in data:
            update_fields.append('photo_description = %s')
            params.append(data['photo_description'])
        
        if 'is_featured' in data:
            update_fields.append('is_featured = %s')
            params.append(data['is_featured'])
        
        if 'display_order' in data:
            update_fields.append('display_order = %s')
            params.append(data['display_order'])
        
        if not update_fields:
            cursor.close()
            conn.close()
            return jsonify({'error': 'No valid fields to update'}), 400
        
        # Always update timestamp
        update_fields.append('updated_at = NOW()')
        params.append(photo_id)
        
        query = f"UPDATE chef_cuisine_photos SET {', '.join(update_fields)} WHERE id = %s"
        cursor.execute(query, params)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Photo updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/<int:photo_id>', methods=['DELETE'])
def delete_cuisine_photo(chef_id, photo_id):
    """Delete a cuisine photo"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get photo info first
        cursor.execute('''
            SELECT photo_url FROM chef_cuisine_photos 
            WHERE id = %s AND chef_id = %s
        ''', (photo_id, chef_id))
        
        photo = cursor.fetchone()
        if not photo:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Photo not found'}), 404
        
        # Delete from database
        cursor.execute('''
            DELETE FROM chef_cuisine_photos 
            WHERE id = %s AND chef_id = %s
        ''', (photo_id, chef_id))
        
        # Delete physical file
        try:
            if photo[0] and photo[0].startswith('/static/'):
                file_path = photo[0][1:]  # Remove leading slash
                if os.path.exists(file_path):
                    os.remove(file_path)
        except:
            pass  # Don't fail if file deletion fails
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Photo deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/limits', methods=['GET'])
def get_chef_photo_limits(chef_id):
    """Get chef's current photo upload limits and usage"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        # Photo limits constants
        MAX_PHOTOS_PER_CUISINE = 10
        MAX_TOTAL_PHOTOS_PER_CHEF = 50
        
        # Get current total photo count
        cursor.execute('''
            SELECT COUNT(*) as total_count 
            FROM chef_cuisine_photos 
            WHERE chef_id = %s
        ''', (chef_id,))
        total_count = cursor.fetchone()['total_count']
        
        # Get photo count by cuisine type
        cursor.execute('''
            SELECT 
                cuisine_type,
                COUNT(*) as photo_count,
                MAX(created_at) as last_uploaded
            FROM chef_cuisine_photos 
            WHERE chef_id = %s
            GROUP BY cuisine_type
            ORDER BY photo_count DESC, cuisine_type
        ''', (chef_id,))
        cuisine_counts = cursor.fetchall()
        
        # Format cuisine counts
        cuisine_usage = []
        for cuisine in cuisine_counts:
            cuisine_usage.append({
                'cuisine_type': cuisine['cuisine_type'],
                'current_count': cuisine['photo_count'],
                'max_allowed': MAX_PHOTOS_PER_CUISINE,
                'remaining_slots': MAX_PHOTOS_PER_CUISINE - cuisine['photo_count'],
                'is_full': cuisine['photo_count'] >= MAX_PHOTOS_PER_CUISINE,
                'last_uploaded': cuisine['last_uploaded'].isoformat() if cuisine['last_uploaded'] else None
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'chef_id': chef_id,
            'limits': {
                'max_photos_per_cuisine': MAX_PHOTOS_PER_CUISINE,
                'max_total_photos_per_chef': MAX_TOTAL_PHOTOS_PER_CHEF
            },
            'current_usage': {
                'total_photos': total_count,
                'remaining_total_slots': MAX_TOTAL_PHOTOS_PER_CHEF - total_count,
                'is_total_limit_reached': total_count >= MAX_TOTAL_PHOTOS_PER_CHEF,
                'usage_percentage': round((total_count / MAX_TOTAL_PHOTOS_PER_CHEF) * 100, 1)
            },
            'cuisine_usage': cuisine_usage,
            'can_upload_more': total_count < MAX_TOTAL_PHOTOS_PER_CHEF
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============= Photo Position Management =============

@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/reorder', methods=['POST'])
def reorder_cuisine_photos(chef_id):
    """Reorder photos within a cuisine type"""
    try:
        data = request.get_json()
        if not data or 'cuisine_type' not in data or 'photo_order' not in data:
            return jsonify({'error': 'cuisine_type and photo_order are required'}), 400
        
        cuisine_type = data['cuisine_type']
        photo_order = data['photo_order']  # Array of photo_ids in desired order
        
        if not isinstance(photo_order, list):
            return jsonify({'error': 'photo_order must be an array of photo IDs'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verify chef exists
        cursor.execute('SELECT id FROM chefs WHERE id = %s', (chef_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Chef not found'}), 404
        
        # Verify all photos belong to chef and cuisine type
        if photo_order:
            placeholders = ','.join(['%s'] * len(photo_order))
            cursor.execute(f'''
                SELECT id FROM chef_cuisine_photos 
                WHERE chef_id = %s AND cuisine_type = %s AND id IN ({placeholders})
            ''', [chef_id, cuisine_type] + photo_order)
            
            found_photos = {row[0] for row in cursor.fetchall()}
            invalid_photos = set(photo_order) - found_photos
            
            if invalid_photos:
                cursor.close()
                conn.close()
                return jsonify({
                    'error': 'Invalid photo IDs found',
                    'invalid_ids': list(invalid_photos)
                }), 400
        
        # Update display_order for each photo
        updated_photos = []
        for index, photo_id in enumerate(photo_order):
            new_order = index + 1
            cursor.execute('''
                UPDATE chef_cuisine_photos 
                SET display_order = %s, updated_at = NOW()
                WHERE id = %s AND chef_id = %s
            ''', (new_order, photo_id, chef_id))
            updated_photos.append({'photo_id': photo_id, 'new_order': new_order})
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            'message': f'Successfully reordered {len(updated_photos)} photos for {cuisine_type}',
            'cuisine_type': cuisine_type,
            'updated_photos': updated_photos
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/<int:photo_id>/move', methods=['POST'])
def move_photo_position(chef_id, photo_id):
    """Move a specific photo to a new position"""
    try:
        data = request.get_json()
        if not data or 'new_position' not in data:
            return jsonify({'error': 'new_position is required (1-based index)'}), 400
        
        new_position = data['new_position']
        if not isinstance(new_position, int) or new_position < 1:
            return jsonify({'error': 'new_position must be a positive integer starting from 1'}), 400
        
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        # Get photo info
        cursor.execute('''
            SELECT cuisine_type, display_order 
            FROM chef_cuisine_photos 
            WHERE id = %s AND chef_id = %s
        ''', (photo_id, chef_id))
        
        photo_info = cursor.fetchone()
        if not photo_info:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Photo not found'}), 404
        
        cuisine_type = photo_info['cuisine_type']
        current_position = photo_info['display_order']
        
        # Get all photos in this cuisine type ordered by display_order
        cursor.execute('''
            SELECT id, display_order 
            FROM chef_cuisine_photos 
            WHERE chef_id = %s AND cuisine_type = %s
            ORDER BY display_order ASC, created_at ASC
        ''', (chef_id, cuisine_type))
        
        all_photos = cursor.fetchall()
        
        if new_position > len(all_photos):
            new_position = len(all_photos)
        
        # Create new order array
        photo_ids = [p['id'] for p in all_photos]
        
        # Remove current photo from its position
        photo_ids.remove(photo_id)
        
        # Insert at new position (convert to 0-based index)
        photo_ids.insert(new_position - 1, photo_id)
        
        # Update all photos with new display_order
        for index, pid in enumerate(photo_ids):
            cursor.execute('''
                UPDATE chef_cuisine_photos 
                SET display_order = %s, updated_at = NOW()
                WHERE id = %s
            ''', (index + 1, pid))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            'message': f'Photo moved from position {current_position} to position {new_position}',
            'photo_id': photo_id,
            'cuisine_type': cuisine_type,
            'old_position': current_position,
            'new_position': new_position
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/chef/<int:chef_id>/cuisine-photos/<int:photo_id>/toggle-featured', methods=['POST'])
def toggle_photo_featured(chef_id, photo_id):
    """Toggle photo featured status (featured photos appear first)"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)
        
        # Get current featured status
        cursor.execute('''
            SELECT is_featured, cuisine_type 
            FROM chef_cuisine_photos 
            WHERE id = %s AND chef_id = %s
        ''', (photo_id, chef_id))
        
        photo = cursor.fetchone()
        if not photo:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Photo not found'}), 404
        
        new_featured_status = not photo['is_featured']
        
        # Update featured status
        cursor.execute('''
            UPDATE chef_cuisine_photos 
            SET is_featured = %s, updated_at = NOW()
            WHERE id = %s AND chef_id = %s
        ''', (new_featured_status, photo_id, chef_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            'message': f'Photo featured status updated',
            'photo_id': photo_id,
            'cuisine_type': photo['cuisine_type'],
            'is_featured': new_featured_status,
            'note': 'Featured photos will appear first in the display order'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

#route for chef to update their availability status
@profile_bp.route('/chef/<int:chef_id>/availability', methods=['PUT'])
def update_chef_availability(chef_id):
    """Update chef's availability status"""
    try:
        data = request.get_json()
        '''if not data or 'is_available' not in data:
            return jsonify({'error': 'is_available field is required'}), 400
        
        is_available = data['is_available']
        if not isinstance(is_available, bool):
            return jsonify({'error': 'is_available must be a boolean value'}), 400'''
        
        if not data or 'availability' not in data:
            return jsonify({'error': 'Availability data required'}), 400

        availability = data['availability']

        conn = get_db_connection()
        cursor = conn.cursor()
        
        #clear chef's current schedule from availability days table
        cursor.execute('DELETE FROM chef_availability_days WHERE chef_id = %s', (chef_id,))

        #insert updated availability into table
        for day_info in availability:
            day_of_week = day_info.get('day_of_week')
            meal_type = day_info.get('meal_type')
            start_time = day_info.get('start_time')  # Expecting 'HH:MM:SS' format 
            end_time = day_info.get('end_time')      # Expecting 'HH:MM:SS' format 

        for day, type in availability.items():
            if day.lower() not in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']:
                continue  # skip invalid days
            for t in type:
                meal_type = t.get('meal_type')
                start_time = t.get('start_time')
                end_time = t.get('end_time')   
            
                if not(meal_type and start_time and end_time):
                    continue  # skip incomplete entries
                
                #inserts new schedule for chef to chef_availability_days table
                cursor.execute('''
                    INSERT INTO chef_availability_days (chef_id, day_of_week, start_time, end_time, meal_type)
                    VALUES (%s, %s, %s, %s, %s)
                ''', (chef_id, day_of_week, start_time, end_time, meal_type))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            'message': 'availability updated successfully',
            'chef_id': chef_id,
            'updated_availability': availability
        }), 200
        
    except Exception as e:
        print(f"Error updating availability for chef {chef_id}: {e}")
        return jsonify({'error': str(e)}), 500