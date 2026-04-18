from flask import Blueprint, request, jsonify
from database.config import db_config
from database.db_helper import get_db_connection, get_cursor, handle_db_error
from ml.matching_scorer import rank_chefs

# Create the search blueprint
search_bp = Blueprint('search', __name__)

@search_bp.route('/chefs/nearby', methods=['GET'])
def search_nearby_chefs():
    """
    Search for chefs within a specified radius of a location
    """
    conn = None
    cursor = None
    try:
        # Get location parameters
        customer_lat = request.args.get('latitude', type=float)
        customer_lon = request.args.get('longitude', type=float) 
        radius = request.args.get('radius', 30, type=float)
        
        # Get other search parameters
        # Support both frontend (searchQuery, timing) and backend (chef_name, meal_timing) parameter names
        chef_name = request.args.get('searchQuery', '').strip() or request.args.get('chef_name', '').strip()
        cuisine = request.args.get('cuisine', '').strip()
        gender = request.args.get('gender', '').strip().lower()
        timing = request.args.get('timing', '').strip().lower() or request.args.get('meal_timing', '').strip().lower()
        min_rating = request.args.get('min_rating', type=float)
        max_price = request.args.get('max_price', type=float)
        sort_by = request.args.get('sort_by', 'distance').lower()  # distance, rating, price, reviews
        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # Convert 'all' to empty string for compatibility
        if gender == 'all':
            gender = ''
        if timing == 'all':
            timing = ''

        if not (customer_lat and customer_lon):
            return jsonify({
                'success': False,
                'error': 'Location required',
                'message': 'Please provide latitude and longitude'
            }), 400

        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Start with base parameters for distance calculation
        params = [customer_lat, customer_lon, customer_lat]

        # Build the complete SQL query with all parameters properly managed
        query = f'''
            SELECT 
                c.id as chef_id,
                c.first_name,
                c.last_name,
                c.first_name || ' ' || c.last_name as full_name,
                c.email,
                c.phone,
                c.gender,
                c.meal_timings,
                
                -- Distance calculation (Haversine formula)
                (3959 * acos(cos(radians(%s)) * cos(radians(ca.latitude)) * 
                cos(radians(ca.longitude) - radians(%s)) + 
                sin(radians(%s)) * sin(radians(ca.latitude)))) as distance_miles,
                
                -- Pricing information
                cp.base_rate_per_person,
                cp.minimum_people,
                cp.maximum_people,
                cp.produce_supply_extra_cost as additional_charges,
                
                -- Address information 
                ca.address_line1 as street_address,
                ca.city,
                ca.state,
                ca.zip_code,
                ca.latitude,
                ca.longitude,
                
                -- Cuisine information
                STRING_AGG(ct.name, ', ' ORDER BY ct.name) as cuisines,
                
                -- Rating information from summary table
                crs.average_rating,
                crs.total_reviews
                
            FROM chefs c
            INNER JOIN chef_addresses ca ON c.id = ca.chef_id AND ca.is_default = TRUE
            LEFT JOIN chef_pricing cp ON c.id = cp.chef_id
            LEFT JOIN chef_cuisines cc ON c.id = cc.chef_id
            LEFT JOIN cuisine_types ct ON cc.cuisine_id = ct.id
            LEFT JOIN chef_rating_summary crs ON c.id = crs.chef_id
        '''
        
        # Add meal timing JOIN if filtering by meal time
        if timing and timing in ['breakfast', 'lunch', 'dinner']:
            query += '''
            INNER JOIN chef_meal_availability cma ON c.id = cma.chef_id 
                AND cma.meal_type = %s AND cma.is_available = TRUE
            '''
            params.append(timing)
        
        query += '''
            WHERE ca.latitude IS NOT NULL 
            AND ca.longitude IS NOT NULL
        '''
        
        # Add chef name filter to WHERE clause (before GROUP BY)
        # searchQuery will search both chef names AND cuisine types (case-insensitive)
        if chef_name:
            query += ''' AND (c.first_name ILIKE %s 
                            OR c.last_name ILIKE %s 
                            OR c.first_name || ' ' || c.last_name ILIKE %s
                            OR EXISTS (
                                SELECT 1 FROM chef_cuisines cc2
                                JOIN cuisine_types ct2 ON cc2.cuisine_id = ct2.id
                                WHERE cc2.chef_id = c.id AND ct2.name ILIKE %s
                            ))'''
            search_pattern = f'%{chef_name}%'
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern])
        
        # Add gender filter to WHERE clause
        if gender and gender in ['male', 'female']:
            query += ' AND c.gender = %s'
            params.append(gender)
        
        query += '''
            GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.gender,
                     cp.base_rate_per_person, cp.minimum_people, cp.maximum_people, cp.produce_supply_extra_cost,
                     ca.address_line1, ca.city, ca.state, ca.zip_code, ca.latitude, ca.longitude,
                     crs.average_rating, crs.total_reviews
            HAVING (3959 * acos(cos(radians(%s)) * cos(radians(ca.latitude)) * 
                cos(radians(ca.longitude) - radians(%s)) + 
                sin(radians(%s)) * sin(radians(ca.latitude)))) <= %s
        '''
        params.extend([customer_lat, customer_lon, customer_lat, radius])
        
        # Add additional HAVING conditions
        if cuisine:
            # PostgreSQL: Use ILIKE for case-insensitive substring search in aggregated cuisines
            query += ' AND cuisines ILIKE %s'
            params.append(f'%{cuisine}%')

        if min_rating is not None and min_rating > 0:
            # Use COALESCE to treat NULL ratings as 0
            query += ' AND COALESCE(average_rating, 0) >= %s'
            params.append(min_rating)

        if max_price is not None:
            query += ' AND (base_rate_per_person IS NULL OR base_rate_per_person <= %s)'
            params.append(max_price)

        # Add dynamic ordering based on sort_by parameter
        if sort_by == 'distance':
            order_clause = 'distance_miles ASC, average_rating DESC, total_reviews DESC'
        elif sort_by == 'rating':
            order_clause = 'average_rating DESC, total_reviews DESC, distance_miles ASC'
        elif sort_by == 'price':
            order_clause = 'base_rate_per_person ASC, distance_miles ASC, average_rating DESC'
        elif sort_by == 'reviews':
            order_clause = 'total_reviews DESC, average_rating DESC, distance_miles ASC'
        else:
            # Default to distance sorting
            order_clause = 'distance_miles ASC, average_rating DESC, total_reviews DESC'
            
        query += f'''
            ORDER BY {order_clause}
            LIMIT %s OFFSET %s
        '''
        params.extend([limit, offset])

        print(f'Executing nearby search query for location ({customer_lat}, {customer_lon}) within {radius} miles')
        print(f'Parameters: chef_name={chef_name}, gender={gender}, timing={timing}, cuisine={cuisine}')
        print(f'Params list length: {len(params)}')
        print(f'Query params: {params}')
        cursor.execute(query, params)
        chefs = cursor.fetchall()
        print(f'Query returned {len(chefs)} chef(s)')

        # Process results
        results = []
        for chef in chefs:
            chef_data = {
                'chef_id': chef['chef_id'],
                'first_name': chef['first_name'],
                'last_name': chef['last_name'],
                'full_name': chef['full_name'],
                'email': chef['email'],
                'phone': chef['phone'],
                'gender': chef['gender'],
                'meal_timings': chef['meal_timings'] if chef['meal_timings'] else [],
                
                # Distance information
                'distance_miles': round(float(chef['distance_miles']), 1) if chef['distance_miles'] else None,
                
                # Location information
                'location': {
                    'street_address': chef['street_address'],
                    'city': chef['city'],
                    'state': chef['state'],
                    'zip_code': chef['zip_code'],
                    'latitude': float(chef['latitude']) if chef['latitude'] else None,
                    'longitude': float(chef['longitude']) if chef['longitude'] else None
                } if chef['city'] else None,
                
                # Pricing information
                'pricing': {
                    'base_rate_per_person': float(chef['base_rate_per_person']) if chef['base_rate_per_person'] else None,
                    'minimum_people': chef['minimum_people'],
                    'maximum_people': chef['maximum_people'],
                    'additional_charges': float(chef['additional_charges']) if chef['additional_charges'] else 0.0
                } if chef['base_rate_per_person'] else None,
                
                # Cuisine information
                'cuisines': chef['cuisines'].split(',') if chef['cuisines'] else [],
                
                # Rating information
                'rating': {
                    'average_rating': round(float(chef['average_rating']), 2) if chef['average_rating'] else None,
                    'total_reviews': chef['total_reviews'] or 0
                }
            }
            results.append(chef_data)

        # Save search to recent searches history (if customer_id is provided)
        # Only save if there's an actual search query
        customer_id = request.args.get('customer_id', type=int)
        if customer_id and chef_name:  # Only save if there's a search query
            try:
                save_cursor = get_cursor(conn)
                
                # First, delete old searches to keep only the most recent 20 per customer
                save_cursor.execute('''
                    DELETE FROM customer_recent_searches
                    WHERE customer_id = %s
                    AND id NOT IN (
                        SELECT id FROM customer_recent_searches
                        WHERE customer_id = %s
                        ORDER BY searched_at DESC
                        LIMIT 20
                    )
                ''', (customer_id, customer_id))
                
                # Then insert the new search
                save_cursor.execute('''
                    INSERT INTO customer_recent_searches 
                    (customer_id, search_query, cuisine, gender, meal_timing, min_rating, 
                     max_price, radius, latitude, longitude, results_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    customer_id,
                    chef_name,  # We already checked it's not empty
                    cuisine if cuisine else None,
                    gender if gender else None,
                    timing if timing else None,
                    min_rating,
                    max_price,
                    radius,
                    customer_lat,
                    customer_lon,
                    len(results)
                ))
                conn.commit()
                save_cursor.close()
                print(f'Saved search to customer_recent_searches for customer {customer_id}: "{chef_name}"')
            except Exception as save_error:
                print(f'Warning: Failed to save search history: {save_error}')
                # Don't fail the request if saving history fails
                conn.rollback()

        response_data = {
            'success': True,
            'chefs': results,
            'search_location': {
                'latitude': customer_lat,
                'longitude': customer_lon
            },
            'search_radius_miles': radius,
            'total_found': len(results),
            'search_params': {
                'searchQuery': chef_name or None,
                'cuisine': cuisine or None,
                'gender': gender or None,
                'timing': timing or None,
                'min_rating': min_rating,
                'max_price': max_price,
                'radius': radius,
                'sort_by': sort_by
            }
        }

        print(f'Nearby search completed: Found {len(results)} chefs within {radius} miles')
        return jsonify(response_data), 200

    except Exception as e:
        print(f'Error in search_nearby_chefs: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to search nearby chefs'
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@search_bp.route('/recent/<int:customer_id>', methods=['GET'])
def get_recent_searches(customer_id):
    """
    Get customer's recent unique search queries (no duplicates)
    Returns the 3 most recent unique searches ordered by time (newest first)
    """
    conn = None
    cursor = None
    try:
        limit = request.args.get('limit', 3, type=int)
        
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Use subquery to get only the most recent search for each unique query
        # Then order by searched_at DESC to show newest first
        cursor.execute('''
            SELECT 
                id,
                search_query,
                cuisine,
                gender,
                meal_timing,
                min_rating,
                max_price,
                radius,
                latitude,
                longitude,
                location_name,
                results_count,
                searched_at
            FROM (
                SELECT DISTINCT ON (search_query) 
                    id,
                    search_query,
                    cuisine,
                    gender,
                    meal_timing,
                    min_rating,
                    max_price,
                    radius,
                    latitude,
                    longitude,
                    location_name,
                    results_count,
                    searched_at
                FROM customer_recent_searches
                WHERE customer_id = %s 
                    AND search_query IS NOT NULL 
                    AND search_query != ''
                ORDER BY search_query, searched_at DESC
            ) AS unique_searches
            ORDER BY searched_at DESC
            LIMIT %s
        ''', (customer_id, limit))
        
        searches = cursor.fetchall()
        
        results = []
        for search in searches:
            search_data = {
                'id': search['id'],
                'search_query': search['search_query'],
                'cuisine': search['cuisine'],
                'gender': search['gender'],
                'meal_timing': search['meal_timing'],
                'min_rating': float(search['min_rating']) if search['min_rating'] else None,
                'max_price': float(search['max_price']) if search['max_price'] else None,
                'radius': float(search['radius']) if search['radius'] else None,
                'latitude': float(search['latitude']) if search['latitude'] else None,
                'longitude': float(search['longitude']) if search['longitude'] else None,
                'location_name': search['location_name'],
                'results_count': search['results_count'],
                'searched_at': search['searched_at'].isoformat() if search['searched_at'] else None
            }
            results.append(search_data)

        return jsonify({
            'success': True,
            'recent_searches': results,
            'total': len(results)
        }), 200

    except Exception as e:
        print(f'Error in get_recent_searches: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@search_bp.route('/viewed-chefs/<int:customer_id>', methods=['POST'])
def save_viewed_chef(customer_id):
    """
    Save or update a chef view record for a customer
    """
    conn = None
    cursor = None
    try:
        data = request.get_json()
        chef_id = data.get('chef_id')
        
        if not chef_id:
            return jsonify({
                'success': False,
                'error': 'chef_id is required'
            }), 400

        conn = get_db_connection()
        cursor = get_cursor(conn)

        # Insert or update the view record
        cursor.execute('''
            INSERT INTO customer_viewed_chefs (customer_id, chef_id, viewed_at, view_count)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 1)
            ON CONFLICT (customer_id, chef_id) 
            DO UPDATE SET 
                viewed_at = CURRENT_TIMESTAMP,
                view_count = customer_viewed_chefs.view_count + 1
        ''', (customer_id, chef_id))
        
        conn.commit()

        return jsonify({
            'success': True,
            'message': 'Chef view recorded'
        }), 200

    except Exception as e:
        print(f'Error in save_viewed_chef: {str(e)}')
        if conn:
            conn.rollback()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@search_bp.route('/viewed-chefs/<int:customer_id>', methods=['GET'])
def get_viewed_chefs(customer_id):
    """
    Get recently booked chefs (based on completed bookings) for a customer
    """
    conn = None
    cursor = None
    try:
        limit = request.args.get('limit', 5, type=int)
        
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Get chefs from completed bookings, ordered by most recent completion
        cursor.execute('''
            SELECT 
                c.id as chef_id,
                c.first_name,
                c.last_name,
                c.email,
                c.phone,
                c.gender,
                c.meal_timings,
                c.photo_url,
                
                -- Get cuisines
                STRING_AGG(DISTINCT ct.name, ', ' ORDER BY ct.name) as cuisines,
                
                -- Get rating
                crs.average_rating,
                crs.total_reviews,
                
                -- Booking info
                MAX(b.updated_at) as last_booking_date,
                COUNT(b.id) as total_bookings
                
            FROM bookings b
            INNER JOIN chefs c ON b.chef_id = c.id
            LEFT JOIN chef_cuisines cc ON c.id = cc.chef_id
            LEFT JOIN cuisine_types ct ON cc.cuisine_id = ct.id
            LEFT JOIN chef_rating_summary crs ON c.id = crs.chef_id
            WHERE b.customer_id = %s 
                AND b.status = 'completed'
                AND b.chef_id IS NOT NULL
            GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.gender, c.meal_timings, c.photo_url,
                     crs.average_rating, crs.total_reviews
            ORDER BY last_booking_date DESC
            LIMIT %s
        ''', (customer_id, limit))
        
        chefs = cursor.fetchall()
        
        results = []
        for chef in chefs:
            chef_data = {
                'chef_id': chef['chef_id'],
                'first_name': chef['first_name'],
                'last_name': chef['last_name'],
                'full_name': f"{chef['first_name']} {chef['last_name']}",
                'email': chef['email'],
                'phone': chef['phone'],
                'gender': chef['gender'],
                'meal_timings': chef['meal_timings'] if chef['meal_timings'] else [],
                'cuisines': chef['cuisines'].split(', ') if chef['cuisines'] else [],
                'rating': {
                    'average_rating': round(float(chef['average_rating']), 2) if chef['average_rating'] else None,
                    'total_reviews': chef['total_reviews'] or 0
                },
                'last_booking_date': chef['last_booking_date'].isoformat() if chef['last_booking_date'] else None,
                'total_bookings': chef['total_bookings'],
                'photo_url': chef['photo_url']
            }
            results.append(chef_data)

        return jsonify({
            'success': True,
            'viewed_chefs': results,
            'total': len(results)
        }), 200

    except Exception as e:
        print(f'Error in get_viewed_chefs: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@search_bp.route('/cuisines', methods=['GET'])
def get_available_cuisines():
    """Get all available cuisine types"""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        cursor.execute('''
            SELECT DISTINCT ct.name, COUNT(cc.chef_id) as chef_count
            FROM cuisine_types ct
            LEFT JOIN chef_cuisines cc ON ct.id = cc.cuisine_id
            GROUP BY ct.name
            HAVING chef_count > 0
            ORDER BY chef_count DESC, ct.name
        ''')
        cuisines = cursor.fetchall()   

        return jsonify({
            'success': True,
            'cuisines': [c['name'] for c in cuisines]
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@search_bp.route('/ranked-chefs', methods=['POST'])
def get_ranked_chefs():
    """
    Return ranked chefs using ML model
    """
    try:
        data = request.get_json()

        results = rank_chefs(data)

        return jsonify({
            "success": True,
            "count": len(results),
            "chefs": results
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500