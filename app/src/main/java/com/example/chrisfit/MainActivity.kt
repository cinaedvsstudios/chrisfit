package com.example.chrisfit

// ===================== IMPORTS =====================
import android.app.DatePickerDialog
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource

// ===================== ACTIVITY =====================
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val db = AppDatabase.getDatabase(this)
        val dao = db.appDao()

        setContent {

            var showSplash by remember { mutableStateOf(true) }

            LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(3500) // 3.5 seconds
                showSplash = false
            }

            if (showSplash) {
                SplashScreen()
            } else {
                AppScreen(dao)
            }
        }
    }
}

// ===================== MAIN SCREEN =====================
@Composable
fun AppScreen(dao: AppDao) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ===================== DATE =====================
    var selectedDate by remember { mutableStateOf(Date()) }
    val calendar = Calendar.getInstance().apply { time = selectedDate }

    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    val dayFormat = SimpleDateFormat("EEEE", Locale.getDefault())
    val displayFormat = SimpleDateFormat("d MMMM yyyy", Locale.getDefault())

    val selectedDateStr = dateFormat.format(selectedDate)
    val displayDay = dayFormat.format(selectedDate)
    val displayDate = displayFormat.format(selectedDate)

    // ===================== DATA =====================
    val entries by dao.getEntriesByDate(selectedDateStr).collectAsState(initial = emptyList())
    val foods by dao.getAllFoods().collectAsState(initial = emptyList())
    val settings by dao.getSettings().collectAsState(initial = null)

    // ===================== TARGETS =====================
    val dailyTarget = settings?.dailyCalories ?: 1500
    val deficitTarget = settings?.dailyDeficit ?: 500
    val bmrValue = settings?.bmr ?: 2000

    // ===================== CALCULATIONS =====================
    val intake = entries.filter { it.calories > 0 }.sumOf { it.calories }
    val burn = entries.filter { it.calories < 0 }.sumOf { -it.calories }
    val diff = intake - burn

    val daysSoFar = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1
    val weeklyTarget = dailyTarget * daysSoFar
    val weeklyDeficitTarget = deficitTarget * daysSoFar

    val dailyColor =
        if (diff <= -deficitTarget) Color(0xFF2E7D32)
        else Color(0xFFC62828)


    // ===================== DATE FORMAT =====================
    fun formatDate(dateStr: String): String {
        val parts = dateStr.split("-")
        val cal = Calendar.getInstance()
        cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())

        val day = SimpleDateFormat("EEE", Locale.getDefault())
            .format(cal.time)
            .uppercase()

        val formatted = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
            .format(cal.time)

        return "$day $formatted"
    }



// ===================== UI STATE =====================
    var showDialog by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showWeightDialog by remember { mutableStateOf(false) }

// 🔥 NAVIGATION
    var showHistory by remember { mutableStateOf(false) }

    var name by remember { mutableStateOf("") }
    var caloriesInput by remember { mutableStateOf("") }
    var isBurn by remember { mutableStateOf(false) }
    var weightInput by remember { mutableStateOf("") }

// 🔥 LOWER DEFAULT POSITION (was 260f)
    var gridHeight by remember { mutableStateOf(310f) }

    val dividerColor = Color(0xFF89E0D4)
// ===================== LAYOUT ROOT =====================
    Box(modifier = Modifier.fillMaxSize()) {



        if (showHistory) {

            val allEntries by dao.getAllEntries().collectAsState(initial = emptyList())
            val allWeights by dao.getAllWeights().collectAsState(initial = emptyList())

            val expandedWeeks = remember { mutableStateMapOf<String, Boolean>() }
            val expandedDays = remember { mutableStateMapOf<String, Boolean>() }

            val groupedByWeek = allEntries.groupBy { entry ->
                val parts = entry.date.split("-")
                val cal = Calendar.getInstance()
                cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())
                cal.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
                SimpleDateFormat("yyyy-MM-dd").format(cal.time)
            }.toSortedMap(compareByDescending { it })

            Column(modifier = Modifier.fillMaxSize()) {


// ================= HEADER =================

// 🔥 GET WEIGHT HERE (same as main screen)

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 12.dp)
                ) {

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {

                        Button(
                            onClick = {
                                calendar.add(Calendar.DAY_OF_YEAR, -1)
                                selectedDate = calendar.time
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                        ) { Text("⬅️") }

                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(displayDay, fontSize = 26.sp)
                            Text(displayDate, fontSize = 16.sp)
                        }

                        Button(
                            onClick = {
                                calendar.add(Calendar.DAY_OF_YEAR, 1)
                                selectedDate = calendar.time
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                        ) { Text("➡️") }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider(color = dividerColor)
                    Spacer(modifier = Modifier.height(8.dp))

                    // ================= SUMMARY =================

                    val dayEntries = allEntries.filter { it.date == selectedDateStr }

                    val dIntake = dayEntries.filter { it.calories > 0 }.sumOf { it.calories }
                    val dBurn = dayEntries.filter { it.calories < 0 }.sumOf { -it.calories }
                    val dNet = dIntake - dBurn

                    val dColor =
                        if (dNet <= -deficitTarget) Color(0xFF2E7D32)
                        else Color.Red

                    val currentWeek = groupedByWeek.values.firstOrNull() ?: emptyList()

                    val wIntake = currentWeek.filter { it.calories > 0 }.sumOf { it.calories }
                    val wBurn = currentWeek.filter { it.calories < 0 }.sumOf { -it.calories }
                    val wNet = wIntake - wBurn

                    val wColor =
                        if (wNet <= -weeklyDeficitTarget) Color(0xFF2E7D32)
                        else Color.Red

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFEAEAEA))
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {

                        // LEFT - DAILY
                        Column {
                            Text("📅 Daily", fontWeight = FontWeight.Bold)
                            Text("🍔 $dIntake / $dailyTarget")
                            Text("🔥 $dBurn")
                            Text("⚖️ $dNet / -$deficitTarget", color = dColor)
                        }

                        // 🔥 MIDDLE - WEIGHT (MATCH SELECTED DATE)

                        val weightForDay = allWeights.firstOrNull { it.date == selectedDateStr }

                        Column(horizontalAlignment = Alignment.CenterHorizontally) {

                            if (weightForDay != null) {

                                val bmi = weightForDay.value / (1.8 * 1.8)

                                Text("⚖️ ${weightForDay.value} kg")
                                Text("📊 ${String.format("%.1f", bmi)} BMI")

                            } else {
                                Text("⚖️ -- kg")
                                Text("📊 -- BMI")
                            }
                        }

                        // RIGHT - WEEKLY
                        Column {
                            Text("📊 Weekly", fontWeight = FontWeight.Bold)
                            Text("🍔 $wIntake / $weeklyTarget")
                            Text("🔥 $wBurn")
                            Text("⚖️ $wNet / -$weeklyDeficitTarget", color = wColor)
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider(color = dividerColor)
                    HorizontalDivider(color = dividerColor)
                }

// ===================== WEIGHT HISTORY =====================
                val allWeights by dao.getAllWeights().collectAsState(initial = emptyList())

                var editMode by remember { mutableStateOf(false) }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, top = 12.dp, end = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Weight history",
                        fontSize = 18.sp,
                        color = Color(0xFF0288D1),
                        fontWeight = FontWeight.Bold
                    )

                    Text(
                        text = if (editMode) "✅" else "✏️",
                        fontSize = 20.sp,
                        modifier = Modifier.clickable { editMode = !editMode }
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .background(Color(0xFFD0ECFF)) // 🔵 light blue
                        .padding(6.dp)
                ) {

// HEADER ROW
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF89E0D4))
                            .padding(horizontal = 8.dp, vertical = 6.dp)
                    ) {
                        Text("📅 DATE", modifier = Modifier.weight(1.6f), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Text("⚖️ KG", modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Text("📊 BMI", modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 12.sp)

                        if (editMode) {
                            Spacer(modifier = Modifier.width(40.dp))
                        }
                    }

                    HorizontalDivider()

                    LazyColumn {

                        items(allWeights) { w ->

                            val bmi = w.value / (1.8 * 1.8)

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp, horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {

                                Text(
                                    text = "📅 ${formatDate(w.date)}",
                                    modifier = Modifier.weight(1.6f),
                                    fontSize = 13.sp
                                )

                                Text(
                                    text = "⚖️ ${w.value}",
                                    modifier = Modifier.weight(1f),
                                    fontSize = 13.sp
                                )

                                Text(
                                    text = "📊 ${String.format("%.1f", bmi)}",
                                    modifier = Modifier.weight(1f),
                                    fontSize = 13.sp
                                )

                                if (editMode) {
                                    Button(
                                        onClick = {
                                            scope.launch {
                                                dao.deleteWeight(w)
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color.Red),
                                        modifier = Modifier.padding(start = 4.dp)
                                    ) {
                                        Text("X")
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Spacer(modifier = Modifier.height(6.dp))
                HorizontalDivider(color = dividerColor)
                Spacer(modifier = Modifier.height(6.dp))

// ===================== BURN HISTORY TITLE =====================
                Text(
                    "Food / Burn history",
                    fontSize = 18.sp,
                    color = Color(0xFF0288D1),
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 12.dp)
                )

                Spacer(modifier = Modifier.height(6.dp))

                // ================= LIST =================
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp)
                ) {

                    groupedByWeek.forEach { (week, weekEntries) ->

                        val weekExpanded = expandedWeeks[week] == true

                        item {
                            Text(
                                if (weekExpanded) "➖ $week" else "➕ $week",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { expandedWeeks[week] = !weekExpanded }
                                    .background(Color(0xFF89E0D4))
                                    .padding(8.dp)
                            )
                        }

                        if (weekExpanded) {

                            val days = weekEntries.groupBy { it.date }

                            days.forEach { (date, dayEntries) ->

                                item {

                                    val intake = dayEntries.filter { it.calories > 0 }.sumOf { it.calories }
                                    val burn = dayEntries.filter { it.calories < 0 }.sumOf { -it.calories }
                                    val net = intake - burn

                                    val expanded = expandedDays[date] == true

                                    Column {

                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { expandedDays[date] = !expanded }
                                                .padding(6.dp)
                                        ) {

                                            Text(
                                                if (expanded) "➖ ${formatDate(date)}" else "➕ ${formatDate(date)}",
                                                modifier = Modifier.weight(1f)
                                            )

                                            Text("🥦 $intake   ")
                                            Text("🔥 $burn   ")
                                            Text(
                                                "⚖️ $net",
                                                color = if (net <= -500) Color(0xFF2E7D32) else Color.Red
                                            )
                                        }

                                        if (expanded) {
                                            dayEntries.forEach { entry ->
                                                val isFood = entry.calories > 0

                                                Text(
                                                    if (isFood)
                                                        "🥦 ${entry.name} (+${entry.calories})"
                                                    else
                                                        "🔥 ${entry.name} (${entry.calories})",
                                                    color = if (isFood) Color(0xFF1976D2) else Color.Red,
                                                    modifier = Modifier.padding(start = 12.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            val wIntake = weekEntries.filter { it.calories > 0 }.sumOf { it.calories }
                            val wBurn = weekEntries.filter { it.calories < 0 }.sumOf { -it.calories }
                            val wNet = wIntake - wBurn

                            item {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0xFFD7CCC8))
                                        .padding(6.dp),
                                    horizontalArrangement = Arrangement.End
                                ) {
                                    Text("🥦 $wIntake   ")
                                    Text("🔥 $wBurn   ")
                                    Text(
                                        "⚖️ $wNet",
                                        color = if (wNet <= -500) Color(0xFF2E7D32) else Color.Red
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Button(
                onClick = { showHistory = false },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(12.dp)
            ) {
                Text("⬅ Back")
            }

        } else {




            // ===================== MAIN SCREEN =====================
            Column {

                // ===================== HEADER =====================
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 12.dp)
                ) {

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {

                        Button(
                            onClick = {
                                calendar.add(Calendar.DAY_OF_YEAR, -1)
                                selectedDate = calendar.time
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                        ) { Text("⬅️") }

                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.clickable {
                                DatePickerDialog(
                                    context,
                                    { _, y, m, d ->
                                        val cal = Calendar.getInstance()
                                        cal.set(y, m, d)
                                        selectedDate = cal.time
                                    },
                                    calendar.get(Calendar.YEAR),
                                    calendar.get(Calendar.MONTH),
                                    calendar.get(Calendar.DAY_OF_MONTH)
                                ).show()
                            }
                        ) {
                            Text(displayDay, fontSize = 26.sp)
                            Text(displayDate, fontSize = 16.sp)
                        }

                        Button(
                            onClick = {
                                calendar.add(Calendar.DAY_OF_YEAR, 1)
                                selectedDate = calendar.time
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                        ) { Text("➡️") }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider(color = dividerColor)
                    Spacer(modifier = Modifier.height(8.dp))


// ===================== SUMMARY =====================
                    val dIntake = intake
                    val dBurn = burn
                    val dNet = diff

                    val dColor =
                        if (dNet <= -deficitTarget) Color(0xFF2E7D32)
                        else Color(0xFFC62828)

                    val wIntake = intake
                    val wBurn = burn
                    val wNet = diff

                    val wColor =
                        if (wNet <= -weeklyDeficitTarget) Color(0xFF2E7D32)
                        else Color(0xFFC62828)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFEAEAEA))
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {

                        Column {
                            Text("📅 Daily", fontWeight = FontWeight.Bold)
                            Text("🍔 $dIntake / $dailyTarget")
                            Text("🔥 $dBurn")
                            Text("⚖️ $dNet / -$deficitTarget", color = dColor)
                        }

                        val latestWeight by dao.getLatestWeight().collectAsState(initial = null)

                        latestWeight?.let { w ->
                            val bmi = w.value / (1.8 * 1.8)

                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("⚖️ ${w.value} kg")
                                Text("📊 ${String.format("%.1f", bmi)} BMI")
                            }
                        } ?: Column {
                            Text("⚖️ -- kg")
                            Text("📊 -- BMI")
                        }

                        Column {
                            Text("📊 Weekly", fontWeight = FontWeight.Bold)
                            Text("🍔 $wIntake / $weeklyTarget")
                            Text("🔥 $wBurn")
                            Text("⚖️ $wNet / -$weeklyDeficitTarget", color = wColor)
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

// ✅ RESTORE NORMAL DIVIDER
                    HorizontalDivider(color = dividerColor)

                    Spacer(modifier = Modifier.height(8.dp))

// ===================== BUTTON GRID =====================
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.height(gridHeight.dp)
                    ) {

                        item {
                            Button(
                                onClick = { showHistory = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                modifier = Modifier.padding(6.dp)
                            ) { Text("History") }
                        }

                        item {
                            Button(
                                onClick = { showWeightDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                modifier = Modifier.padding(6.dp)
                            ) { Text("Add Weight") }
                        }

                        item {
                            Button(
                                onClick = { showDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2)),
                                modifier = Modifier.padding(6.dp)
                            ) { Text("Add Other") }
                        }

                        item {
                            Button(
                                onClick = {
                                    scope.launch {
                                        dao.insertEntry(
                                            Entry(
                                                date = selectedDateStr,
                                                name = "BMR",
                                                calories = -bmrValue
                                            )
                                        )
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2)),
                                modifier = Modifier.padding(6.dp)
                            ) { Text("Add BMR") }
                        }

                        items(foods) { food ->
                            Button(
                                onClick = {
                                    scope.launch {
                                        dao.insertEntry(
                                            Entry(
                                                date = selectedDateStr,
                                                name = food.name,
                                                calories = food.calories
                                            )
                                        )
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6A1B9A)),
                                modifier = Modifier.padding(6.dp)
                            ) {
                                Text(food.name)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

// 🔥 DRAG HANDLE (NOW IN CORRECT POSITION)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(20.dp)
                            .pointerInput(Unit) {
                                detectDragGestures { _, dragAmount ->
                                    gridHeight = (gridHeight + dragAmount.y)
                                        .coerceIn(120f, 500f)
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            HorizontalDivider(
                                color = dividerColor,
                                thickness = 2.dp,
                                modifier = Modifier.fillMaxWidth(0.3f)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            HorizontalDivider(
                                color = dividerColor,
                                thickness = 2.dp,
                                modifier = Modifier.fillMaxWidth(0.3f)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                } // ✅ CLOSE HEADER COLUMN

                // ===================== ENTRY LIST =====================
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(start = 12.dp, end = 12.dp, bottom = 80.dp)
                ) {
                    items(entries) { entry ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("${entry.name} (${entry.calories})")

                            Button(
                                onClick = { scope.launch { dao.deleteEntry(entry) } },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
                            ) {
                                Text("X")
                            }
                        }
                    }
                }
            }

            Button(
                onClick = { showSettings = true },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(12.dp)
            ) {
                Text("⚙ Settings")
            }
        }
    }


// ===================== SETTINGS SCREEN =====================
    if (showSettings) {
        SettingsScreen(
            dao = dao,
            onClose = { showSettings = false }
        )
    }

// ===================== ADD ENTRY DIALOG =====================
    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                Button(onClick = {
                    val cal = caloriesInput.toIntOrNull() ?: 0
                    val finalCalories = if (isBurn) -cal else cal

                    scope.launch {
                        dao.insertEntry(
                            Entry(
                                date = selectedDateStr,
                                name = name,
                                calories = finalCalories
                            )
                        )
                    }

                    showDialog = false
                    name = ""
                    caloriesInput = ""
                    isBurn = false
                }) { Text("Save") }
            },
            dismissButton = { Button(onClick = { showDialog = false }) { Text("Cancel") } },
            title = { Text("Add Entry") },
            text = {
                Column {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
                    OutlinedTextField(value = caloriesInput, onValueChange = { caloriesInput = it }, label = { Text("Calories") })

                    Row {
                        Checkbox(checked = isBurn, onCheckedChange = { isBurn = it })
                        Text("Burn")
                    }
                }
            }
        )
    }

// ===================== ADD WEIGHT DIALOG =====================
    if (showWeightDialog) {
        AlertDialog(
            onDismissRequest = { showWeightDialog = false },
            confirmButton = {
                Button(onClick = {

                    val weightValue = weightInput.toFloatOrNull()

                    if (weightValue != null) {

                        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                        val today = dateFormat.format(selectedDate)

                        scope.launch {
                            dao.insertWeight(
                                Weight(
                                    date = today,
                                    value = weightValue
                                )
                            )
                        }
                    }

                    showWeightDialog = false
                    weightInput = ""

                }) { Text("Save") }
            },
            dismissButton = {
                Button(onClick = { showWeightDialog = false }) {
                    Text("Cancel")
                }
            },
            title = { Text("Add Weight") },
            text = {
                OutlinedTextField(
                    value = weightInput,
                    onValueChange = { weightInput = it },
                    label = { Text("Weight (kg)") }
                )
            }
        )
    }
}

// 👇👇👇 PASTE HERE EXACTLY 👇👇👇

@Composable
fun SplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.splashicon),
            contentDescription = "Splash Logo",
            modifier = Modifier.size(200.dp)
        )
    }
}
