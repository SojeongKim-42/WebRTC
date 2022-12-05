mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

const configuration12 = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 30,
};

const configuration23 = {
  iceServers: [
    {
      urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 30,
};

const configuration31 = {
  iceServers: [
    {
      urls: ["stun:stun3.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 30,
};

let peerConnection12 = null;
let peerConnection23 = null;
let peerConnection31 = null;
let localStream = null;
let remoteStreamA = null;
let remoteStreamB = null;
let roomDialog = null;
let roomId = null;
let exists2 = false;

function init() {
  document.querySelector("#cameraBtn").addEventListener("click", openUserMedia);
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#createBtn").addEventListener("click", createRoom);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  document.querySelector("#playBtn").addEventListener("click", playgame);

  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

//�� ������ ����
async function createRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#playBtn").disabled = false; 

  const db = firebase.firestore();
  const roomRef = await db.collection("rooms").doc();

  // 1�� 2, 1�� 3 ������ RTCPeerConnection ����
  console.log("Create PeerConnection with configuration: ", configuration12);
  peerConnection12 = new RTCPeerConnection(configuration12);
  console.log("Create PeerConnection with configuration: ", configuration31);
  peerConnection31 = new RTCPeerConnection(configuration31);

  registerPeerConnectionListeners(peerConnection12);
  registerPeerConnectionListeners(peerConnection31);

  localStream.getTracks().forEach((track) => {
    peerConnection12.addTrack(track, localStream);
    peerConnection31.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below (1-2, 1-3)
  const callerCandidatesCollection12 = roomRef.collection("callerCandidate12");
  peerConnection12.addEventListener("icecandidate", (event) => {
    if (!event.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate: ", event.candidate);
    callerCandidatesCollection12.add(event.candidate.toJSON());
  });

  const callerCandidatesCollection31 = roomRef.collection("callerCandidate31");
  peerConnection31.addEventListener("icecandidate", (event) => {
    if (!event.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate3: ", event.candidate);
    callerCandidatesCollection31.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room and offer from 1 below
  //�����ڿ��� ������ sdp ����, caller�� setlocaldescription�� ���� ���� sdp����
  const offer12 = await peerConnection12.createOffer();
  await peerConnection12.setLocalDescription(offer12);
  console.log("Created offer12:", offer12);

  const offer31 = await peerConnection31.createOffer();
  await peerConnection31.setLocalDescription(offer31);
  console.log("Created offer31:", offer31);

  const roomWithOffer = {
    offer1to2: {
      type: offer12.type,
      sdp: offer12.sdp,
    },
    offer1to3: {
      type: offer31.type,
      sdp: offer31.sdp,
    },
  };

  await roomRef.set(roomWithOffer);

  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector(
    "#currentRoom"
  ).innerText = `Current room is ${roomRef.id} - You are the caller!`;
  // Code for creating a room and offer from 1 above

  // remoteVideo �� ���� track �Ҵ�
  peerConnection12.addEventListener("track", (event) => {
    console.log("Got remoteA track:", event.streams[0]);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Add a track to the remoteStreamA:", track);
      remoteStreamA.addTrack(track);
    });
  });

  peerConnection31.addEventListener("track", (event) => {
    console.log("Got remoteB track:", event.streams[0]);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Add a track to the remoteStreamB:", track);
      remoteStreamB.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection12.currentRemoteDescription && data && data.answer2to1) {
      console.log("Got remoteA description: ", data.answer2to1);
      const rtcSessionDescription = new RTCSessionDescription(data.answer2to1);
      await peerConnection12.setRemoteDescription(rtcSessionDescription);
    }
  });

  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection31.currentRemoteDescription && data && data.answer3to1) {
      console.log("Got remoteB description: ", data.answer3to1);
      const rtcSessionDescription = new RTCSessionDescription(data.answer3to1);
      await peerConnection31.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection("calleeCandidate12").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection12.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  roomRef.collection("calleeCandidate31").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection31.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

// join �� ����
function joinRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#playBtn").disabled = true;
  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      roomId = document.querySelector("#room-id").value;
      console.log("Join room: ", roomId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    },
    { once: true }
  );
  roomDialog.open();
}

// room ID�� �� ����
async function joinRoomById(roomId) {

  //fireStore���� roomID�� DB�� �����´�.
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log("Got room:", roomSnapshot.exists);

  //roomID�� ��Ȯ�� �Է����� ��
  if (roomSnapshot.exists) {
    //�ش� room�� ó�� join�� ������ userID=2(����2), �� ��°�� join�� ������ userID=3(����3)
    let userID = 2;
    const exists2 = roomSnapshot.data().answer2to1;
    if (exists2 != undefined) {
      userID = 3;
    }

    let configuration = null;
    if (userID == 2) {
      configuration = configuration12;
    } else if (userID == 3) {
      configuration = configuration31;
    }

    // ����1���� ���ῡ ���� RTCPeerConnection�� �����.
    console.log("Create PeerConnection with configuration: ", configuration);
    let peerConnectionWith1 = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners(peerConnectionWith1);
    localStream.getTracks().forEach((track) => {
      peerConnectionWith1.addTrack(track, localStream);
    });

    // ����1�� ���� -----
    // Code for collecting ICE callee candidates below
    if (userID == 2) {
      const calleeCandidatesCollection12 =
        roomRef.collection("calleeCandidate12");
      peerConnectionWith1.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        calleeCandidatesCollection12.add(event.candidate.toJSON());
      });
    } else if (userID == 3) {
      const calleeCandidatesCollection31 =
        roomRef.collection("calleeCandidate31");
      peerConnectionWith1.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        calleeCandidatesCollection31.add(event.candidate.toJSON());
      });
    }
    // Code for collecting ICE candidates above

    // ����1(����)�� ������ remoteStreamA�� �����Ѵ�.
    peerConnectionWith1.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStreamA:", track);
        remoteStreamA.addTrack(track);
      });
    });

    // userID�� ���� ����1�� ���� answer������ + callerCandidate�� ����1 �߰�
    // Code for creating SDP answer below
    let offer = null;
    if (userID == 2) {

      offer = roomSnapshot.data().offer1to2;
      console.log("Got offer:", offer);
      await peerConnectionWith1.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answerTo1 = await peerConnectionWith1.createAnswer();
      console.log("Created answer:", answerTo1);
      await peerConnectionWith1.setLocalDescription(answerTo1);

      roomWithAnswer = {
        answer2to1: {
          type: answerTo1.type,
          sdp: answerTo1.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);

      roomRef.collection("callerCandidate12").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
            await peerConnectionWith1.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });

    } else if (userID == 3) {
      offer = roomSnapshot.data().offer1to3;
      console.log("Got offer:", offer);
      await peerConnectionWith1.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answerTo1 = await peerConnectionWith1.createAnswer();
      console.log("Created answer:", answerTo1);
      await peerConnectionWith1.setLocalDescription(answerTo1);

      roomWithAnswer = {
        answer3to1: {
          type: answerTo1.type,
          sdp: answerTo1.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);

      roomRef.collection("callerCandidate31").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(
              `Got new remote ICE candidate: ${JSON.stringify(data)}`
            );
            await peerConnectionWith1.addIceCandidate(
              new RTCIceCandidate(data)
            );
          }
        });
      });
    }

    // 2�� 3���� �����ϴ� RTCConnection ����
    console.log("Create PeerConnection with configuration: ", configuration23);
    peerConnection23 = new RTCPeerConnection(configuration23);
    registerPeerConnectionListeners(peerConnection23);
    localStream.getTracks().forEach((track) => {
      peerConnection23.addTrack(track, localStream);
    });

    console.log("!!!!your ID: !!!!", userID);

    if (userID == 2) {

      // caller candidate�� ����2 �߰�
      const callerCandidatesCollection23 =
        roomRef.collection("callerCandidate23");
      peerConnection23.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate3: ", event.candidate);
        callerCandidatesCollection23.add(event.candidate.toJSON());
      });

      // remoteStreamB���� ����3 track
      peerConnection23.addEventListener("track", (event) => {
        console.log("Got remote3 track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
          console.log("Add a track to the remoteStreamB:", track);
          remoteStreamB.addTrack(track);
        });
      });

      // 2�� 3���� ������ offer ����
      const offer2to3 = await peerConnection23.createOffer();
      await peerConnection23.setLocalDescription(offer2to3);
      console.log("Created offer23:", offer2to3);

      let roomWithOfferTo3 = {
        offer2to3: {
          type: offer2to3.type,
          sdp: offer2to3.sdp,
        },
      };

      await roomRef.update(roomWithOfferTo3);

      // Listening for remote session description below (3���� 2�� ���� answer�� remoteDescription�� �ִ´�.)
      roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection23.currentRemoteDescription && data && data.answer3to2) {
          console.log("Got remote3 description: ", data.answer3to2);
          const rtcSessionDescription = new RTCSessionDescription(data.answer3to2);
          await peerConnection23.setRemoteDescription(rtcSessionDescription);
        }
      });
      // Listening for remote session description above

      // Listen for remote ICE callee candidates below
      roomRef.collection("calleeCandidate23").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
            await peerConnection23.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listen for remote ICE callee candidates below


    } else if (userID == 3) {
      // callee candidate�� ����3 �߰�
      const calleeCandidatesCollection23 =
        roomRef.collection("calleeCandidate23");
      peerConnection23.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        calleeCandidatesCollection23.add(event.candidate.toJSON());
      });

      // remoteStreamB���� ����2 track
      peerConnection23.addEventListener("track", (event) => {
        console.log("Got remote track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
          console.log("Add a track to the remoteStreamB:", track);
          remoteStreamB.addTrack(track);
        });
      });

      // Code for creating SDP answer below (2�� 3���� ���� offer�� �޾Ƽ� �̿� ���� answer�� ������)
      let offer23 = roomSnapshot.data().offer2to3;
      console.log("Got offer from 2:", offer23);
      await peerConnection23.setRemoteDescription(
        new RTCSessionDescription(offer23)
      );
      const answer3to2 = await peerConnection23.createAnswer();
      console.log("Created answer to 2:", answer3to2);
      await peerConnection23.setLocalDescription(answer3to2);

      let roomWithAnswerTo2 = {
        answer3to2: {
          type: answer3to2.type,
          sdp: answer3to2.sdp,
        },
      };

      await roomRef.update(roomWithAnswerTo2);

      // Listen for remote ICE caller candidates below
      roomRef.collection("callerCandidate23").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
            await peerConnection23.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listen for remote ICE caller candidates above

    }
  }
}

// ������ ī�޶�/������� ���� �� ����
async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  document.querySelector("#localVideo").srcObject = stream;
  localStream = stream;
  remoteStreamA = new MediaStream();
  remoteStreamB = new MediaStream();
  document.querySelector("#remoteVideoA").srcObject = remoteStreamA;
  document.querySelector("#remoteVideoB").srcObject = remoteStreamB;

  console.log("Stream:", document.querySelector("#localVideo").srcObject);
  document.querySelector("#cameraBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = false;
  document.querySelector("#createBtn").disabled = false;
  document.querySelector("#playBtn").disabled = false; 
  document.querySelector("#hangupBtn").disabled = false;
}

async function playgame(roomId, userID) {
  document.querySelector("#playBtn").disabled = true; 
  var words = ["gwangju", "science", "work", "study", "college", "team", "startup", "math"];
  let randomlist = [];
  //�ܾ�3���� �������� �̱� 
  while (words.length > 5 ) {
    const list = words.splice(Math.floor(Math.random()* words.length),1)[0];
    randomlist.push(list);
    }
  

 //user1�� w1, user2�� w2, user3�� w3�� �Ҵ���� 
  let w1 = randomlist[0];
  let w2 = randomlist[1];
  let w3 = randomlist[2];

  console.log(randomlist);
  console.log(w1);
  console.log(w2);
  console.log(w3);

  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const word1 = roomRef.collection("user1");
  word1.add(w1);
  const word2 = roomRef.collection("user2");
  word1.add(w2);
  const word3 = roomRef.collection("user3");
  word1.add(w3);

  // user 1�� ��� ������ �ܾ� ���� 
  document.querySelector(
        "#forbiddenword1"
  ). innerText = "Forbidden word of User2 is " + w2;
  document.querySelector(
        "#forbiddenword2"
  ). innerText = " Forbidden word of User3 is " + w3;
  
 
  
  if (userID == 2) {
    document.querySelector(
        "#forbiddenword1"
  ). innerText = "Forbidden word of User1 is " + w1;
   document.querySelector(
        "#forbiddenword2"
  ). innerText = " Forbidden word of User3 is " + w3; 
  } else if (userID == 3 ) {
  document.querySelector(
        "#forbiddenword1"
  ). innerText = "Forbidden word of User1 is " + w1;
   document.querySelector(
        "#forbiddenword2"
  ). innerText = " Forbidden word of User2 is " + w2; 
  }
 }
 
// ������ ������ �� ����
async function hangUp(e) {
  const tracks = document.querySelector("#localVideo").srcObject.getTracks();
  tracks.forEach((track) => {
    track.stop();
  });

  if (remoteStreamA) {
    remoteStreamA.getTracks().forEach((track) => track.stop());
  }
  if (remoteStreamB) {
    remoteStreamB.getTracks().forEach((track) => track.stop());
  }

  if (peerConnection12) {
    peerConnection12.close();
  }
  if (peerConnection23) {
    peerConnection23.close();
  }
  if (peerConnection31) {
    peerConnection31.close();
  }

  document.querySelector("#localVideo").srcObject = null;
  document.querySelector("#remoteVideoA").srcObject = null;
  document.querySelector("#remoteVideoB").srcObject = null;
  document.querySelector("#cameraBtn").disabled = false;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#playBtn").disabled = true; 
  document.querySelector("#hangupBtn").disabled = true;
  document.querySelector("#currentRoom").innerText = "";

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const calleeCandidate12 = await roomRef
      .collection("calleeCandidate12")
      .get();
    calleeCandidate12.forEach(async (candidate) => {
      await candidate.ref.delete();
    });

    const calleeCandidate23 = await roomRef
      .collection("calleeCandidate31")
      .get();
    calleeCandidate23.forEach(async (candidate) => {
      await candidate.ref.delete();
    });

    const calleeCandidate31 = await roomRef
      .collection("calleeCandidate23")
      .get();
    calleeCandidate31.forEach(async (candidate) => {
      await candidate.ref.delete();
    });

    const callerCandidate12 = await roomRef
      .collection("callerCandidate12")
      .get();
    callerCandidate12.forEach(async (candidate) => {
      await candidate.ref.delete();
    });

    const callerCandidate23 = await roomRef
      .collection("callerCandidate23")
      .get();
    callerCandidate23.forEach(async (candidate) => {
      await candidate.ref.delete();
    });

    const callerCandidate31 = await roomRef
      .collection("callerCandidate31")
      .get();
    callerCandidate31.forEach(async (candidate) => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

// PeerConnectionListener�� �ǰڴ�. (������ �޾Ƶ��̰ڴ�.)
function registerPeerConnectionListeners(peerConnection) {
  peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(`ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener("signalingstatechange", () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();