// ──────────────────────────────────────────────────────────────
// UNREAD BADGES – Referenz-Implementierung für mobile Apps
// ──────────────────────────────────────────────────────────────
// Dieses Backend + die Web-App schreiben automatisch:
//   users/{uid}/projectReads.{assignmentId}  (Timestamp)
//   project_notes  (alle Notizen mit assignmentId, userId, createdAt)
//
// Die mobile App muss die unread badges client-seitig berechnen.
// Unten stehen fertige Implementierungen für die drei gängigsten
// Frameworks. Wähle das passende aus und kopiere es ins Projekt.
// ──────────────────────────────────────────────────────────────



// ====================================================================
// FLUTTER / DART  (empfohlen)
// ====================================================================
/*
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Gibt die Anzahl ungelesener Notizen pro assignmentId zurück.
/// Läuft in Echtzeit via Firestore Snapshot-Listener.
final unreadCountsProvider = StreamProvider.family<int, String>((ref, uid) {
  return FirebaseFirestore.instance
      .collection('project_notes')
      .orderBy('createdAt', descending: true)
      .limit(500)
      .snapshots()
      .map((snap) {
    // projectReads aus der map holen (vom User-Dokument)
    // Diese müssen parallel geladen werden – hier vereinfacht.
    final reads = ref.watch(projectReadsProvider(uid)).valueOrNull ?? {};
    final counts = <String, int>{};

    for (final doc in snap.docs) {
      final note = doc.data();
      if (note['userId'] == uid) continue; // eigene Notizen ignorieren
      final aid = note['assignmentId'] as String?;
      if (aid == null) continue;
      final lastRead = reads[aid] as Timestamp?;
      final createdAt = note['createdAt'] as Timestamp?;
      if (lastRead != null && createdAt != null && createdAt <= lastRead) continue;
      counts[aid] = (counts[aid] ?? 0) + 1;
    }
    return counts;
  });
});

/// projectReads als Stream (users/{uid}/projectReads)
final projectReadsProvider = StreamProvider.family<Map<String, dynamic>, String>(
  (ref, uid) => FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) => snap.data()?['projectReads'] as Map<String, dynamic>? ?? {}),
);

/// Markiert ein Projekt als gelesen.
Future<void> markProjectRead(String uid, String assignmentId) async {
  await FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .update({'projectReads.$assignmentId': FieldValue.serverTimestamp()});
}

/// ─── Widget Beispiel ──────────────────────────────────────────
class ProjectListWidget extends ConsumerWidget {
  final String uid;
  const ProjectListWidget({required this.uid});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countAsync = ref.watch(unreadCountsProvider(uid));

    return countAsync.when(
      data: (counts) => ListView(
        children: projects.map((project) {
          final unread = counts[project.id] ?? 0;
          return ListTile(
            title: Text(project.name),
            trailing: unread > 0
                ? Badge(label: Text('$unread'))
                : null,
            onTap: () {
              markProjectRead(uid, project.id);
              Navigator.push(...);
            },
          );
        }).toList(),
      ),
      loading: () => const CircularProgressIndicator(),
      error: (e, _) => Text('Fehler: $e'),
    );
  }
}
*/



// ====================================================================
// SWIFT (iOS native)
// ====================================================================
/*
import FirebaseFirestore

class UnreadBadgeService: ObservableObject {
  @Published var unreadCounts: [String: Int] = [:]
  private var listener: ListenerRegistration?
  private var userListener: ListenerRegistration?
  private var uid: String = ""
  private var projectReads: [String: Timestamp] = [:]

  func start(uid: String) {
    self.uid = uid

    // User-Dokument abonnieren (projectReads Map)
    userListener = Firestore.firestore()
      .collection("users").document(uid)
      .addSnapshotListener { [weak self] snap, _ in
        self?.projectReads = snap?.data()?["projectReads"] as? [String: Timestamp] ?? [:]
      }

    // Alle project_notes abonnieren
    listener = Firestore.firestore()
      .collection("project_notes")
      .order(by: "createdAt", descending: true)
      .limit(to: 500)
      .addSnapshotListener { [weak self] snap, _ in
        guard let self = self else { return }
        var counts: [String: Int] = [:]
        for doc in snap?.documents ?? [] {
          let data = doc.data()
          if data["userId"] as? String == uid { continue }
          guard let aid = data["assignmentId"] as? String else { continue }
          let lastRead = projectReads[aid]
          let createdAt = data["createdAt"] as? Timestamp
          if let last = lastRead, let created = createdAt, created <= last { continue }
          counts[aid, default: 0] += 1
        }
        DispatchQueue.main.async { self.unreadCounts = counts }
      }
  }

  func stop() {
    listener?.remove()
    userListener?.remove()
  }

  func markAsRead(assignmentId: String) {
    Firestore.firestore()
      .collection("users").document(uid)
      .updateData(["projectReads.\(assignmentId)": FieldValue.serverTimestamp()])
  }
}
*/



// ====================================================================
// KOTLIN (Android native)
// ====================================================================
/*
class UnreadBadgeViewModel : ViewModel() {
  private val _unreadCounts = MutableStateFlow<Map<String, Int>>(emptyMap())
  val unreadCounts: StateFlow<Map<String, Int>> = _unreadCounts.asStateFlow()

  private var notesRegistration: ListenerRegistration? = null
  private var userRegistration: ListenerRegistration? = null
  private var projectReads = mutableMapOf<String, Timestamp>()

  fun start(uid: String) {
    // User-Dokument abonnieren
    userRegistration = FirebaseFirestore.getInstance()
      .collection("users").document(uid)
      .addSnapshotListener { snap, _ ->
        @Suppress("UNCHECKED_CAST")
        val reads = snap?.get("projectReads") as? Map<String, Timestamp> ?: emptyMap()
        projectReads = reads.toMutableMap()
      }

    // Alle project_notes abonnieren
    notesRegistration = FirebaseFirestore.getInstance()
      .collection("project_notes")
      .orderBy("createdAt", Query.Direction.DESCENDING)
      .limit(500)
      .addSnapshotListener { snap, _ ->
        val counts = mutableMapOf<String, Int>()
        for (doc in snap?.documents ?: emptyList()) {
          val data = doc.data ?: continue
          if (data["userId"] == uid) continue
          val aid = data["assignmentId"] as? String ?: continue
          val lastRead = projectReads[aid]
          val createdAt = data["createdAt"] as? Timestamp
          if (lastRead != null && createdAt != null && createdAt <= lastRead) continue
          counts[aid] = (counts[aid] ?: 0) + 1
        }
        _unreadCounts.value = counts
      }
  }

  fun markAsRead(assignmentId: String) {
    FirebaseFirestore.getInstance()
      .collection("users").document(auth.currentUser!!.uid)
      .update(mapOf("projectReads.$assignmentId" to FieldValue.serverTimestamp()))
  }

  override fun onCleared() {
    notesRegistration?.remove()
    userRegistration?.remove()
  }
}
*/
