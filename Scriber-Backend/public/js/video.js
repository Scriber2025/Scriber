document.addEventListener('DOMContentLoaded', () => {
  const socket = io('https://tjl8m83g-3001.euw.devtunnels.ms/'); 
  const localVideo = document.getElementById('localVideo');
  let localStream = null;
  let screenStream = null;
  let isSharingScreen = false;
  const peerConnections = {};
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };


  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      localStream = stream;
      localVideo.srcObject = stream; 

      const myUserId = Date.now();
      socket.emit('join-room', { roomId: 'chat', userId: myUserId });

      socket.on('all-users', ({ users, screenSharer }) => {
 

  users.forEach(otherUserId => {

    callUser(otherUserId, false); 
    if (screenSharer === otherUserId) {
      setTimeout(() => {
        callUser(otherUserId, true); 
      }, 500); 
    }
  });
});

     
      socket.on('new-user', ({ userId: newUserId }) => {
      
        callUser(newUserId);
      });
    })
    .catch(err => console.error('[Client] getUserMedia hatası:', err));


  socket.on('offer', async ({ from, offer, isScreenOffer }) => {
    console.log(`[Client] Gelen offer from=${from}, isScreenOffer=${isScreenOffer}`);

    let pc = peerConnections[from];
    if (!pc) {
      pc = createPeerConnection(from);
      console.log(`[Client] offer için yeni PeerConnection oluşturuldu: ${from}`);
    } else {
      console.log(`[Client] offer için mevcut PeerConnection kullanılıyor: ${from}`);
    }
    console.log(`[Client] offer içeriği:`, offer);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`[Client] setRemoteDescription başarılı: ${from}`);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(`[Client] createAnswer & setLocalDescription(answer) başarılı: ${from}`);


      socket.emit('answer', { to: from, answer: pc.localDescription, isScreenAnswer: isScreenOffer });
    } catch (e) {
      console.error('[Client] offer işlenirken hata:', e);
    }
  });


  socket.on('answer', async ({ from, answer, isScreenAnswer }) => {
    console.log(`[Client] Gelen answer from=${from}, isScreenAnswer=${isScreenAnswer} , answer:`, answer);
    const pc = peerConnections[from];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        console.log(`[Client] setRemoteDescription(answer) başarılı: ${from}`);
      } catch (e) {
        console.error('[Client] answer işlenirken hata:', e);
      }
    }
  });


  socket.on('ice-candidate', async ({ from, candidate }) => {
    const pc = peerConnections[from];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[Client] ICE Candidate eklendi: from=${from}`);
      } catch (e) {
        console.error('[Client] ICECandidate ekleme hatası:', e);
      }
    }
  });


  socket.on('user-disconnected', userId => {
    console.log(`[Client] user-disconnected: ${userId}`);
    if (peerConnections[userId]) {
      peerConnections[userId].close();
      delete peerConnections[userId];
    }
    const camVid = document.getElementById(userId + '-camera');
    if (camVid) camVid.remove();
    const scrVid = document.getElementById(userId + '-screen');
    if (scrVid) scrVid.remove();
  });


  function createPeerConnection(userId) {
    const pc = new RTCPeerConnection(config);
    peerConnections[userId] = pc;
    localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
    });
    if(screenStream){
       screenStream.getTracks().forEach(track => {pc.addTrack(track, screenStream)} )
    }
 
    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log(`[Client] onicecandidate → to=${userId}`, event.candidate.candidate?.substring(0, 50));
        socket.emit('ice-candidate', { to: userId, candidate: event.candidate });
      }
    };


    pc.ontrack = event => {
      const remoteTrack = event.track;
      let stream = null;
      if (event.streams && event.streams.length > 0) {
        stream = event.streams[0];
      } else {
        stream = new MediaStream([remoteTrack]);
      }
      const isScreen = /screen|window|display/i.test(remoteTrack.label);
      const container = isScreen
        ? document.getElementById('screenVideos')
        : document.getElementById('videos');
      const suffix = isScreen ? '-screen' : '-camera';
      const videoId = userId + suffix;
      let videoEl = document.getElementById(videoId);
      if (!videoEl) {
        console.log("video eklendi")
        videoEl = document.createElement('video');
        videoEl.id = videoId;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.dataset.userId = userId;
        videoEl.dataset.type = isScreen ? 'screen' : 'camera';
        videoEl.style.width = isScreen ? '100%' : '200px';
        videoEl.style.height = isScreen ? 'auto' : '150px';
        container.appendChild(videoEl);
      }

      console.log(`[Client] ontrack: userId=${userId}, isScreen=${isScreen}`, stream);

      if (!videoEl.srcObject) {
        videoEl.srcObject = stream;
      } else {
        videoEl.srcObject.addTrack(remoteTrack);
      }
    };

    
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });

    
    if (localStream) {
      localStream.getAudioTracks().forEach(t => audioTransceiver.sender.replaceTrack(t));
      localStream.getVideoTracks().forEach(t => videoTransceiver.sender.replaceTrack(t));
    }
    if(screenStream) {
      screenStream.getVideoTracks().forEach(t => videoTransceiver.sender.replaceTrack(t));
      console.log("screenStream var, video transceiver'a eklendi")
    }
    return pc;
  }


  async function callUser(userId, isScreenOffer = false) {
    console.log(`[Client] callUser: ${userId}, isScreenOffer=${isScreenOffer}`);
    console.log("peers: ", peerConnections);
    const pc = peerConnections[userId] || createPeerConnection(userId);
    console.log('pc: ', pc);
    try {
  
      if (isScreenOffer && localStream) {
   
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const videoTransceiver = pc.getTransceivers().find(tr =>
          tr.sender && tr.sender.track && tr.sender.track.kind === 'video'
        );
        if (videoTransceiver) {
          videoTransceiver.sender.replaceTrack(screenTrack);
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer: pc.localDescription, isScreenOffer: true });
      } else {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer: pc.localDescription, isScreenOffer: false });
      }

    } catch (e) {
      console.error('[Client] callUser() hatası:', e);
    }
  }

  async function startScreenShare() {
    if (isSharingScreen) return;

    isSharingScreen = true;

    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });


    const localScreenVid = document.createElement('video');
    localScreenVid.id = 'screenVideo';
    localScreenVid.srcObject = screenStream;
    localScreenVid.autoplay = true;
    localScreenVid.muted = true;
    localScreenVid.playsInline = true;
    localScreenVid.style.width = '100%';
    localScreenVid.style.height = 'auto';
    document.getElementById('videos').appendChild(localScreenVid);


    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    
    Object.entries(peerConnections).forEach(async ([otherId, pc]) => {
      const videoTransceiver = pc.getTransceivers().find(tr =>
        tr.sender && tr.sender.track && tr.sender.track.kind === 'video'
      );
      if (!videoTransceiver) {
        console.warn(`[Client] ${otherId} için videoTransceiver bulunamadı`);
        return;
      }
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        videoTransceiver.sender.replaceTrack(screenTrack);
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: otherId, offer: pc.localDescription, isScreenOffer: true });
        console.log(`[Client] Ekran-offer gönderildi to=${otherId}`);
      } catch (err) {
        console.error('[Client] replaceTrack sonrası offer hatası:', err);
      }
    });
  }


  async function stopScreenShare() {
    isSharingScreen = false;

    Object.entries(peerConnections).forEach(async ([otherId, pc]) => {

      const videoTransceiver = pc.getTransceivers().find(tr =>
        tr.sender && tr.sender.track && tr.sender.track.kind === 'video'
      );
      if (!videoTransceiver) {
        console.warn(`[Client] stopScreenShare: ${otherId} için videoTransceiver yok`);
        return;
      }
      const camTrack = localStream.getVideoTracks()[0];
      if (camTrack) {
        videoTransceiver.sender.replaceTrack(camTrack);
        console.log(`[Client] (${otherId}) için replaceTrack(ekran→kamera) yapıldı`);
      }

 
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: otherId, offer: pc.localDescription, isScreenOffer: false });
        console.log(`[Client] Kamera-offer gönderildi to=${otherId}`);
      } catch (err) {
        console.error('[Client] stopScreenShare sonrası offer hatası:', err);
      }
    });


    const localVid = document.getElementById('screenVideo');
    if (localVid) {
      localVid.srcObject.getTracks().forEach(t => t.stop());
      localVid.remove();
    }
  }

 
  const startBtn = document.getElementById('startScreenShare');
  const stopBtn = document.getElementById('stopScreenShare');
  startBtn.onclick = async () => {
    await startScreenShare();
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };
  stopBtn.onclick = () => {
    stopScreenShare();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
});
