//import map from './map.js';

let mapa = null;
let vista = null;
let baseLayer = null;
let satelliteLayer = null;
let markerLayer = null;
let markerSource = null;
let mapInitLatitude = 0;
let mapInitLongitude = 0;
let selectInteraction;
let origen={
    lat: 0,
    lon: 0
}
let destino={
    lat:0,
    lon:0
}
let wp=[];
let od = 'o';
let marcadorActual = null;
let velocidadAnterior = 0;
let datosRutaLocal = null;

navigator.serviceWorker.register('./sw.js', { scope: './' });
window.addEventListener("load", inicializarMapa);


async function inicializarMapa() {
    datosRutaLocal = leerLocalStorage();
    if (!datosRutaLocal) { 
        datosRutaLocal = { 
            rutas: [],
         };
        grabarLocalStorage(datosRutaLocal);
    }
    try {
        const coords = await obtenerPosicion();
        mapInitLatitude = coords.latitude;
        mapInitLongitude = coords.longitude;
    } catch (error) {
        console.error('Error al obtener la ubicación:', error);
        // Usar valores predeterminados si falla
    }

    // Crear el mapa después de obtener la posición
    baseLayer = new ol.layer.Tile({
        source: new ol.source.OSM()
    });
    satelliteLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attributions: 'Source: Esri',  
        }),
    });
    markerSource = new ol.source.Vector();
    markerLayer = new ol.layer.Vector({
        source: markerSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#ff0000' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
            }),
        }),
    });

    vista = new ol.View({
        center: ol.proj.fromLonLat([mapInitLongitude, mapInitLatitude]), // Coordenadas de inicio
        zoom: 12, // Nivel de zoom inicial
        projection: 'EPSG:3857', // Proyección del mapa
    });
    mapa = new ol.Map({
        target: 'map', // ID del contenedor del mapa
        layers: [ baseLayer,markerLayer ],
        view: vista, // Asocia la vista al mapa
    });

    // Crear la capa vectorial para los marcadores
    markerLayer = new ol.layer.Vector({
        source: markerSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#ff0000' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
            }),
        }),
    });

    // Dibujar rutas guardadas
    if (datosRutaLocal.rutas.length > 0) {
        document.getElementById('datosRuta').style.display='flex';
        datosRutaLocal.rutas.forEach((ruta) => {
            const geometria = ruta.geometria.map(coord => 
                ol.proj.fromLonLat([coord[0], coord[1]])
            );

            const routeLine = new ol.geom.LineString(geometria);

            const routeSource = new ol.source.Vector({
                features: [new ol.Feature({ geometry: routeLine })],
            });

            const routeLayer = new ol.layer.Vector({
                source: routeSource,
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'blue',
                        width: 4,
                    }),
                }),
            });

            // Agregar la capa al mapa
            mapa.addLayer(routeLayer);
        });
        actualizarInteraccionSeleccion();
    }
    inicializarEventosMapa();
}

function obtenerPosicion() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (error) => reject(error),
            {
                enableHighAccuracy: true, // Usa GPS para mayor precisión
                timeout: 1000, // Tiempo máximo para obtener la ubicación
                maximumAge: 0 // No usa datos en caché
            }
        );
    });
}

function inicializarEventosMapa() {
    mapa.on('click', function (event) {
        const [longitude, latitude] = ol.proj.toLonLat(event.coordinate);
        if (od === 'o') {
            origen = { lat: latitude, lon: longitude };
        } else if(od==='d'){
            destino = { lat: latitude, lon: longitude };
        } else {
            wp.push([longitude,latitude]);
        }
        console.log(`Clic en el mapa: Longitud ${longitude}, Latitud ${latitude}`);
    });

    document.getElementById('origen').addEventListener('click', seleccionarOrigen);
    document.getElementById('destino').addEventListener('click', seleccionarDestino);
    document.getElementById('wayPoint').addEventListener('click', seleccionarWP);
    document.getElementById('calcularRuta').addEventListener('click', calcularRuta);
    document.getElementById('bmenu').addEventListener('click', desplegarMenu);
    document.getElementById('vista').addEventListener('click', cambiarVista);
    // Asignar eventos a cada opción del menú
    const menuItems = document.querySelectorAll('#menuDesplegable li');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const menu = document.getElementById('menuDesplegable');

            // Ejecutar una función específica según el id o texto del elemento
            switch (item.id) {
                case 'menuRuta':
                    submenuRuta();
                    break;
                case 'menuVelo':
                    submenuVelo();
                    break;
                case 'menuWP':
                    submenuWP();
                    break;
            }

            // Ocultar el menú después de la selección
            menu.style.display='none';
        });
    });
    document.querySelectorAll('input[name="bRuta"]').forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) {
                switch(input.id){
                    case 'origen':
                        seleccionarOrigen();
                        break;
                    case 'destino':
                        seleccionarDestino();
                        break;
                    case 'wayPoint':
                        seleccionarWP();
                        break;
                }
            }
        });
    });
}

function submenuRuta() {
    document.getElementById('controlesRuta').style.display="flex";
    document.getElementById('velo').style.display="none";
}

async function submenuVelo() {
    document.getElementById('controlesRuta').style.display="none";
    document.getElementById('velo').style.display="flex";
    let datosRuta = document.getElementById('datosRuta');
    if(datosRuta.style.display='none'){
        datosRuta.style.display='flex';
    }

    let posicion=[0,0];
    //centrar mapa
    try{
        const coords = await obtenerPosicion();
        posicion=[coords.longitude,coords.latitude];
    } catch (error) {
        console.error('Error al obtener la ubicación:', error);
    }
    const centro = ol.proj.fromLonLat(posicion);
    ponerMarcador(posicion);
    ajustarZoom3km(centro);
    actualizarPosicion()
}

function submenuWP() {
    console.log("Opción seleccionada: Punto de interés");
    // Aquí puedes agregar lógica específica para esta opción
}

function seleccionarOrigen() {
    od='o';
    wp=[];
}

function seleccionarDestino() {
    od='d';
    wp=[];
}

function seleccionarWP(){
    od='w';
}

async function calcularRuta() {
    if (!origen || !destino) return alert('Selecciona origen y destino');

    const apiKey = '5b3ce3597851110001cf6248f5cba351b26a46b3a0766a42b429ae6e'; // Cambiar con tu API Key

    // Crear el cuerpo de la solicitud en formato JSON
    const coordinates = [[origen.lon, origen.lat], ...wp, [destino.lon, destino.lat]];
    const body = JSON.stringify({ coordinates });

    const url = "https://api.openrouteservice.org/v2/directions/driving-car";
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': apiKey,
            },
            body,
        });

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            // Obtener la ruta desde la respuesta
            const route = data.routes[0];
            // Decodificar la geometría comprimida
            const decodedGeometry = decodePolyline(route.geometry);
            // Convertir las coordenadas a EPSG:3857 (usado por OpenLayers)
            const transformedRoute = decodedGeometry.map(coord => 
                ol.proj.fromLonLat([coord[0], coord[1]])
            );

            // Crear una nueva geometría de línea
            const routeLine = new ol.geom.LineString(transformedRoute);
            const km = ol.sphere.getLength(routeLine) / 1000;
            document.getElementById('kms').innerText = km.toFixed(2);

            // Crear una fuente vectorial y agregar la geometría
            const routeSource = new ol.source.Vector({
                features: [new ol.Feature({ geometry: routeLine })],
            });
            // Crear una capa vectorial con estilo
            const routeLayer = new ol.layer.Vector({
                source: routeSource,
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'blue',
                        width: 4,
                    }),
                }),
            });

            // Agregar la capa al mapa
            mapa.addLayer(routeLayer);
            // Ajustar la vista del mapa para abarcar toda la ruta
            const extent = routeLine.getExtent();
            mapa.getView().fit(extent, { padding: [50, 50, 50, 50] });
            actualizarInteraccionSeleccion();
            let datosRuta = document.getElementById('datosRuta');
            if(datosRuta.style.display='none'){
                datosRuta.style.display='flex';
            }

            // Guardar la ruta en datosRuta.rutas
            datosRutaLocal = leerLocalStorage();
            const nuevaRuta = {
                origen,
                destino,
                wp,
                geometria: decodedGeometry,
                km: km.toFixed(2),
                kmR: 0,
            };

            // Verificar duplicados antes de guardar
            const yaExiste = datosRutaLocal.rutas.some(r => 
                JSON.stringify(r.geometria) === JSON.stringify(nuevaRuta.geometria)
            );

            if (!yaExiste) {
                datosRutaLocal.rutas.push(nuevaRuta);
                grabarLocalStorage(datosRutaLocal);
                console.log("Ruta guardada correctamente.");
            } else {
                console.log("La ruta ya existe, no se guardará duplicada.");
            }            
        }
    } catch (error) {
        console.error("Error al obtener la ruta:", error);
    }
}

function actualizarPosicion() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            const { latitude, longitude, accuracy, speed } = pos.coords;
            const posicionProyectada = ol.proj.fromLonLat([longitude, latitude]);
            // Calcular un zoom dinámico en función de la precisión
            let zoom;
            if (accuracy <= 10) {
                zoom = 17;
            } else if (accuracy <= 50) {
                zoom = 15;
            } else if (accuracy <= 100) {
                zoom = 13;
            } else {
                zoom = 11;
            }

            marcadorActual.setGeometry(new ol.geom.Point(posicionProyectada));

            mapa.getView().setCenter(posicionProyectada);
            mapa.getView().setZoom(zoom);            

            // Calcular y actualizar la velocidad
            const velocidadKmH = speed ? (speed * 3.6) : 0; // Convertir de m/s a km/h
            actualizarVelocimetro(velocidadKmH);

        }, error => console.error('Error al obtener ubicación:', error), {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 1000
        });
    } else {
        alert("La geolocalización no está disponible en este dispositivo.");
    }
}

function actualizarPosicionSimulada() {
    const geometria = obtenerGeometria(mapa);
    simuladorRuta(geometria, (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        const posicionProyectada = ol.proj.fromLonLat([longitude, latitude]);
        // Calcular un zoom dinámico en función de la precisión
        let zoom;
        if (accuracy <= 10) {
            zoom = 17;
        } else if (accuracy <= 50) {
            zoom = 15;
        } else if (accuracy <= 100) {
            zoom = 13;
        } else {
            zoom = 11;
        }

        marcadorActual.setGeometry(new ol.geom.Point(posicionProyectada));

        mapa.getView().setCenter(posicionProyectada);
        mapa.getView().setZoom(zoom);            

        // Calcular y actualizar la velocidad
        const velocidadKmH = speed ? (speed * 3.6) : 0; // Convertir de m/s a km/h
        actualizarVelocimetro(velocidadKmH);

    }, error => console.error('Error al obtener ubicación:', error),{ velocidadMaxima: 90, aceleracion: 3 });
}


function desplegarMenu(){
    const menuDes = document.getElementById('menuDesplegable');
    const mapa = document.getElementById('map');
    const mapTop = window.getComputedStyle(mapa).top;
    menuDes.style.top = mapTop;
    menuDes.style.display='flex';
}


function cambiarVista(){
    const chec = document.getElementById('vista').checked;
    if (chec){
        mapa.addLayer(satelliteLayer);
    }else{
        mapa.removeLayer(satelliteLayer);
    }
}

function actualizarInteraccionSeleccion() {
    // Eliminar la interacción de selección actual (si existe)
    if (selectInteraction) {
        mapa.removeInteraction(selectInteraction);
    }
    
    // Crear una nueva interacción de selección que incluya todas las capas vectoriales
    selectInteraction = new ol.interaction.Select({
        layers: function(layer) {
            // Seleccionar solo capas de tipo Vector
            return layer instanceof ol.layer.Vector;
        },
        condition: ol.events.condition.click // Selección mediante click
    });
    
    // Agregar la nueva interacción al mapa
    mapa.addInteraction(selectInteraction);

    // Manejo del evento de selección
    selectInteraction.on('select', function (event) {
        const selectedFeatures = event.selected; // Características seleccionadas
        const deselectedFeatures = event.deselected; // Características deseleccionadas
        
        console.log('Características seleccionadas:', selectedFeatures);
        console.log('Características deseleccionadas:', deselectedFeatures);

        // Iterar sobre las características seleccionadas
        selectedFeatures.forEach(feature => {
            const geometry = feature.getGeometry();

            if (geometry.getType() === 'LineString') {
                // Calcular la longitud en metros
                const km = ol.sphere.getLength(geometry) / 1000;
                document.getElementById('kms').innerText = km.toFixed(2);
                //ver si esta guardada y actualizar kmRecorridos
                datosRutaLocal.rutas.forEach(ruta =>{
                    if (ruta.km = km){
                        document.getElementById('kmsR').innerText = ruta.kmR.toFixed(2);
                    }
                });
            }
        });
    });
}

function decodePolyline(encoded) {
    let current = [0, 0];
    let coords = [];
    let factor = 1e-5; // Factor de precisión de coordenadas

    for (let i = 0; i < encoded.length; ) {
        for (let j = 0; j < 2; j++) {
            let shift = 0,
                result = 0;
            let byte;
            do {
                byte = encoded.charCodeAt(i++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            const delta = result & 1 ? ~(result >> 1) : result >> 1;
            current[j] += delta;
        }
        coords.push([current[1] * factor, current[0] * factor]);
    }

    return coords;
}

function actualizarVelocimetro(velocidad) {
    const speedElement = document.getElementById('speed');
    const needle = document.querySelector('.needle');
    // Suavizar la transición del velocímetro
    let velocidadSuavizada = (velocidadAnterior * 0.3) + (velocidad * 0.7);
    // Limitar velocidad entre 0 y 180
    velocidadSuavizada = Math.min(180, Math.max(0, velocidadSuavizada));
    velocidadAnterior = velocidadSuavizada;
    speedElement.innerText = velocidadSuavizada.toFixed(0);
    // Calcular el ángulo de la aguja (0-180 grados)
    const angle = (velocidadSuavizada / 180) * 180; // Ajustar para el rango de 0-180
    needle.style.transform = `rotate(${angle}deg)`;
}

function ajustarZoom3km(center) {
    const radius = 3000; // Radio de 3 km
    const projection = mapa.getView().getProjection();
    const metersPerUnit = ol.proj.getPointResolution(projection, 1, center); // Conversión a metros
    
    // Crear un buffer de 5 km alrededor del centro
    const extent = [
        center[0] - radius / metersPerUnit, // Izquierda
        center[1] - radius / metersPerUnit, // Abajo
        center[0] + radius / metersPerUnit, // Derecha
        center[1] + radius / metersPerUnit  // Arriba
    ];

    // Ajustar la vista del mapa para que muestre esta extensión
    mapa.getView().fit(extent, {
        size: mapa.getSize(),
        padding: [50, 50, 50, 50], // Margen alrededor del área visible
        maxZoom: 18 // Opcional: evita que se acerque demasiado
    });
}

function ponerMarcador(posicion){
    marcadorActual = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat(posicion)),
    });

    // Agregar el marcador a la fuente vectorial de la capa `markerLayer`
    markerSource.addFeature(marcadorActual);
}




function simuladorRuta(geometria, callback, errorCallback, options = {}) {
    const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 1000, // Intervalo entre actualizaciones (ms)
        maximumAge: 0,
        velocidadMaxima: 90, // km/h
        aceleracion: 5 // Aceleración en m/s²
    };
    options = { ...defaultOptions, ...options };

    // Obtener coordenadas de la geometría
    const routeCoords = geometria.getCoordinates();

    if (!routeCoords || routeCoords.length < 2) {
        errorCallback(new Error("La geometría debe contener al menos dos puntos."));
        return null;
    }

    let currentIndex = 0; // Índice del punto actual
    let watchId;
    let velocidadActual = 0; // Velocidad inicial en m/s
    let tiempoTranscurrido = 0; // Tiempo total transcurrido en segundos

    function avanzar() {
        if (currentIndex >= routeCoords.length - 1) {
            clearInterval(watchId);
            console.log("Simulación completada.");
            callback(null); // Notificar el final
            return;
        }

        const [currentLon, currentLat] = ol.proj.toLonLat(routeCoords[currentIndex]);
        const [nextLon, nextLat] = ol.proj.toLonLat(routeCoords[currentIndex + 1]);

        const distancia = ol.sphere.getDistance([currentLon, currentLat], [nextLon, nextLat]);
        const tiempoIntervalo = options.timeout / 1000; // Tiempo en segundos para cada intervalo

        // Incrementar la velocidad con aceleración constante
        velocidadActual += options.aceleracion * tiempoIntervalo;
        const velocidadMaximaMS = options.velocidadMaxima * 1000 / 3600; // km/h a m/s
        velocidadActual = Math.min(velocidadActual, velocidadMaximaMS); // Limitar al máximo

        tiempoTranscurrido += tiempoIntervalo;

        // Avanzar al siguiente punto si la distancia es menor o igual al desplazamiento
        if (velocidadActual * tiempoTranscurrido >= distancia) {
            currentIndex++;
        }

        // Calcular la posición actual interpolando entre puntos
        const currentProyectada = ol.proj.fromLonLat([currentLon,currentLat]);
        const nextProyectada = ol.proj.fromLonLat([nextLon,nextLat]);
        const progress = Math.min(1, (velocidadActual * tiempoIntervalo) / distancia);
        const currentLatInterpolado = currentProyectada[1] + progress * (nextProyectada[1] - currentProyectada[1]);
        const currentLonInterpolado = currentProyectada[0] + progress * (nextProyectada[0] - currentProyectada[0]);
        const currentLonLat = ol.proj.toLonLat([currentLonInterpolado,currentLatInterpolado]);
        const position = {
            coords: {
                latitude: currentLonLat[1],
                longitude: currentLonLat[0],
                accuracy: options.enableHighAccuracy ? 5 : 50,
                speed: velocidadActual // m/s
            },
            timestamp: Date.now()
        };

        callback(position);
    }

    watchId = setInterval(avanzar, options.timeout);

    callback({ coords: null, status: 'iniciado' }); // Notificar inicio

    return {
        clearWatch: () => clearInterval(watchId)
    };
}

function obtenerGeometria(mapa) {
    // Obtener las capas del mapa
    const capas = mapa.getLayers().getArray();

    // Filtrar solo las capas vectoriales
    const capasVectoriales = capas.filter((capa) => capa instanceof ol.layer.Vector);

    if (capasVectoriales.length === 0) {
        console.error("No se encontraron capas vectoriales.");
        return null;
    }

    // Iterar sobre las capas vectoriales para encontrar una geometría LineString
    for (const capa of capasVectoriales) {
        const vectorSource = capa.getSource();
        const features = vectorSource.getFeatures();

        // Buscar la primera geometría de tipo LineString en las características
        const featureLineString = features.find(
            (feature) => feature.getGeometry() instanceof ol.geom.LineString
        );

        if (featureLineString) {
            // Obtener la geometría de la característica
            const geometria = featureLineString.getGeometry();

            return geometria;
        }
    }

    console.error("No se encontró ninguna geometría de tipo LineString.");
    return null;
}

function grabarLocalStorage(datos) {
    localStorage.setItem('rutaDatosLocal', JSON.stringify(datos));
}

function leerLocalStorage() {
    const data = localStorage.getItem('rutaDatosLocal');
    return data ? JSON.parse(data) : null;
}
