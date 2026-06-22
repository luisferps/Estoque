rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /imoveis/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /tipos/{doc} {
      allow read: if true;
      allow write: if true;
    }
    match /corretores/{doc} {
      allow read, write: if request.auth != null;
    }
    match /configuracoes/{doc} {
      allow read: if true;
      allow write: if true;
    }
    match /contadores/{doc} {
      allow read: if true;
      allow write: if true;
    }
  }
}
