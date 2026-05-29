package com.example.chrisfit

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun SettingsScreen(
    dao: AppDao,
    onClose: () -> Unit
) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val settings by dao.getSettings().collectAsState(initial = null)
    val foods by dao.getAllFoods().collectAsState(initial = emptyList())

    var calories by remember { mutableStateOf("") }
    var deficit by remember { mutableStateOf("") }
    var bmr by remember { mutableStateOf("") }

    var newFoodName by remember { mutableStateOf("") }
    var newFoodCalories by remember { mutableStateOf("") }

    val snackbarHostState = remember { SnackbarHostState() }

    // ===================== FILE PICKERS =====================

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri: Uri? ->
        uri?.let {
            exportDataToUri(context, dao, it)
            scope.launch { snackbarHostState.showSnackbar("Exported ✓") }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        uri?.let {
            importDataFromUri(context, dao, it)
            scope.launch { snackbarHostState.showSnackbar("Imported ✓") }
        }
    }

    LaunchedEffect(settings) {
        settings?.let {
            calories = it.dailyCalories.toString()
            deficit = it.dailyDeficit.toString()
            bmr = it.bmr.toString()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Settings", style = MaterialTheme.typography.titleLarge)

                    Button(onClick = onClose) {
                        Text("✕")
                    }
                }
            }

            item {
                OutlinedTextField(
                    value = calories,
                    onValueChange = { calories = it },
                    label = { Text("Daily Calories") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                OutlinedTextField(
                    value = deficit,
                    onValueChange = { deficit = it },
                    label = { Text("Daily Deficit") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                OutlinedTextField(
                    value = bmr,
                    onValueChange = { bmr = it },
                    label = { Text("BMR") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                Button(
                    onClick = {
                        scope.launch {
                            dao.insertSettings(
                                Settings(
                                    dailyCalories = calories.toIntOrNull() ?: 1500,
                                    dailyDeficit = deficit.toIntOrNull() ?: 500,
                                    bmr = bmr.toIntOrNull() ?: 2000
                                )
                            )
                            snackbarHostState.showSnackbar("Settings saved ✓")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save Settings")
                }
            }

            // ===================== FOOD =====================

            item {
                Text("Food Buttons", style = MaterialTheme.typography.titleMedium)
                HorizontalDivider()
            }

            item {
                OutlinedTextField(
                    value = newFoodName,
                    onValueChange = { newFoodName = it },
                    label = { Text("Food Name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                OutlinedTextField(
                    value = newFoodCalories,
                    onValueChange = { newFoodCalories = it },
                    label = { Text("Calories") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                Button(
                    onClick = {
                        val name = newFoodName.trim()
                        val cal = newFoodCalories.toIntOrNull()

                        if (name.isEmpty() || cal == null) {
                            scope.launch {
                                snackbarHostState.showSnackbar("Enter name + calories")
                            }
                            return@Button
                        }

                        scope.launch {
                            dao.insertFood(Food(name = name, calories = cal))
                            snackbarHostState.showSnackbar("Food added ✓")
                        }

                        newFoodName = ""
                        newFoodCalories = ""
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Add Food")
                }
            }

            items(foods) { food ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {

                    Text("${food.name} (${food.calories})")

                    Button(
                        onClick = {
                            scope.launch {
                                dao.deleteFood(food)
                                snackbarHostState.showSnackbar("Deleted ✓")
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("X")
                    }
                }
            }

            // ===================== BACKUP =====================

            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text("Backup", style = MaterialTheme.typography.titleMedium)
                HorizontalDivider()
            }

            item {
                Button(
                    onClick = {
                        exportLauncher.launch("backup.json")
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("📤 Export Data")
                }
            }

            item {
                Button(
                    onClick = {
                        importLauncher.launch(arrayOf("application/json"))
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("📥 Import Data")
                }
            }

            item {
                Button(
                    onClick = {
                        scope.launch {
                            dao.deleteAllEntries()
                            dao.deleteAllFoods()
                            dao.deleteAllWeights()
                            snackbarHostState.showSnackbar("All data deleted ⚠")
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Red),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("⚠ Reset All Data")
                }
            }

            item {
                Spacer(modifier = Modifier.height(60.dp))
            }
        }
    }
}

// ===================== EXPORT =====================

fun exportDataToUri(context: Context, dao: AppDao, uri: Uri) {
    CoroutineScope(Dispatchers.IO).launch {

        val entries = dao.getAllEntries().first()
        val foods = dao.getAllFoods().first()
        val weights = dao.getAllWeights().first()

        val json = JSONObject()

        val entryArray = JSONArray()
        for (e in entries) {
            val obj = JSONObject()
            obj.put("date", e.date)
            obj.put("name", e.name)
            obj.put("calories", e.calories)
            entryArray.put(obj)
        }

        val foodArray = JSONArray()
        for (f in foods) {
            val obj = JSONObject()
            obj.put("name", f.name)
            obj.put("calories", f.calories)
            foodArray.put(obj)
        }

        val weightArray = JSONArray()
        for (w in weights) {
            val obj = JSONObject()
            obj.put("date", w.date)
            obj.put("value", w.value)
            weightArray.put(obj)
        }

        json.put("entries", entryArray)
        json.put("foods", foodArray)
        json.put("weights", weightArray)

        context.contentResolver.openOutputStream(uri)?.use {
            it.write(json.toString().toByteArray())
        }
    }
}

// ===================== IMPORT =====================

fun importDataFromUri(context: Context, dao: AppDao, uri: Uri) {
    CoroutineScope(Dispatchers.IO).launch {

        val text = context.contentResolver.openInputStream(uri)
            ?.bufferedReader()
            ?.readText() ?: return@launch

        val json = JSONObject(text)

        dao.deleteAllEntries()
        dao.deleteAllFoods()
        dao.deleteAllWeights()

        val entries = json.getJSONArray("entries")
        for (i in 0 until entries.length()) {
            val e = entries.getJSONObject(i)
            dao.insertEntry(
                Entry(
                    date = e.getString("date"),
                    name = e.getString("name"),
                    calories = e.getInt("calories")
                )
            )
        }

        val foods = json.getJSONArray("foods")
        for (i in 0 until foods.length()) {
            val f = foods.getJSONObject(i)
            dao.insertFood(
                Food(
                    name = f.getString("name"),
                    calories = f.getInt("calories")
                )
            )
        }

        val weights = json.getJSONArray("weights")
        for (i in 0 until weights.length()) {
            val w = weights.getJSONObject(i)
            dao.insertWeight(
                Weight(
                    date = w.getString("date"),
                    value = w.getDouble("value").toFloat()
                )
            )
        }
    }
}