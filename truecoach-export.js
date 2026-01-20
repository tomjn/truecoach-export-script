/**
 * TrueCoach Workout Data Exporter
 *
 * Usage:
 * 1. Log into TrueCoach at https://app.truecoach.co
 * 2. Open DevTools (F12 or Cmd+Option+I on Mac)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 * 5. Wait for export to complete - CSV downloads automatically
 */

(async function exportTrueCoachWorkouts() {
  const PER_PAGE = 20;
  const STATES = 'completed';//,missed,pending';

  console.log('🏋️ TrueCoach Export - Starting...');

  function getAuthCookie() {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const cookie = cookies.find(c => c.startsWith('ember_simple_auth-session='));
    if (!cookie) return null;

    const value = decodeURIComponent(cookie.split('=')[1]);

    let json;
    try {
      json = JSON.parse(value);
    } catch (e) {
      console.error('Failed to parse ember_simple_auth-session cookie', e);
      return null;
    }
    return json
  }

  // Extract bearer token from Ember Simple Auth session cookie
  function getBearerToken() {
    const json = getAuthCookie()
    return json?.authenticated?.access_token || null;
  }

  function getClientID() {
    const json = getAuthCookie()
    return json?.authenticated?.user_id || null;
  }

  function getApiBase() {
    const CLIENT_ID = getClientID();
    const API_BASE = `https://app.truecoach.co/proxy/api/clients/${CLIENT_ID}/workouts`;
    return API_BASE;
  }

  const token = getBearerToken();
  if (!token) {
    console.error('❌ Could not extract bearer token. Make sure you are logged into TrueCoach.');
    return;
  }
  console.log('🔑 Bearer token extracted successfully');

  // Collect all workouts and workout items across pages
  const allWorkouts = [];
  const allWorkoutItems = [];
  let currentPage = 1;
  let totalPages = 1;

  try {
    // Fetch all pages
    do {
      const API_BASE = getApiBase();
      const url = `${API_BASE}?states=${STATES}&per_page=${PER_PAGE}&page=${currentPage}&order=desc`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Dnt': 1,
          'Referer': 'https://app.truecoach.co/client/workouts?_=true',
          'Role': 'Client'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // On first request, get total pages
      if (currentPage === 1) {
        totalPages = data.meta.total_pages;
        console.log(`📊 Found ${data.meta.total_count} workouts across ${totalPages} pages`);
      }

      console.log(`📥 Fetching page ${currentPage} of ${totalPages}...`);

      // Collect data
      allWorkouts.push(...(data.workouts || []));
      allWorkoutItems.push(...(data.workout_items || []));

      currentPage++;

      // Small delay to avoid rate limiting
      if (currentPage <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

    } while (currentPage <= totalPages);

    console.log(`✅ Fetched ${allWorkouts.length} workouts and ${allWorkoutItems.length} exercises`);

    // Build workout lookup map for joining
    const workoutMap = new Map();
    for (const workout of allWorkouts) {
      workoutMap.set(workout.id, workout);
    }

    // Build CSV rows
    const csvRows = [];

    // Header row
    csvRows.push(['date', 'exercise_name', 'instructions', 'result', 'state', 'workout_title']);

    // Data rows - join workout items to their parent workout
    for (const item of allWorkoutItems) {
      const workout = workoutMap.get(item.workout_id);

      if (!workout) {
        console.warn(`⚠️ Orphan workout item: ${item.id}`);
        continue;
      }

      csvRows.push([
        workout.due || '',
        item.name || '',
        item.info || '',
        item.result || '',
        item.state || '',
        workout.title || ''
      ]);
    }

    // Convert to CSV string with proper escaping
    const csvContent = csvRows.map(row =>
      row.map(cell => {
        const str = String(cell);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `truecoach-workouts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    console.log(`🎉 Export complete! Downloaded ${csvRows.length - 1} exercise records.`);
    console.log('📁 Check your Downloads folder for the CSV file.');

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.error('Make sure you are logged into TrueCoach in this browser tab.');
  }

})();
